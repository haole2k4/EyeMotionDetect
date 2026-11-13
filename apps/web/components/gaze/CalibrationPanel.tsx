"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalibrationSession } from "../../lib/gaze/calibration";
import { PolynomialGazeMapper } from "../../lib/gaze/polynomial";
import {
  getCalibrationLocally,
  getCalibrationSamplesLocally,
  resetCalibrationLocally,
  saveCalibrationSamplesLocally,
} from "../../lib/gaze/storage";
import { markGazeWeightsUpdated } from "../../lib/gaze/weights-sync";
import { api } from "../../lib/api";
import type { CalibrationSample, GazeFeatures } from "../../lib/gaze/types";
import { useAuthStore } from "@/store/auth";
import { useGaze } from "./GazeProvider";

type Mode = "fallback" | "polynomial";

interface CalibrationPanelProps {
  cameraReady: boolean;
  onModelApplied: (mode: Mode) => void;
}

interface CalibrationPoint {
  x: number;
  y: number;
}

const POS_1 = 1 / 6; // 0.1666...
const POS_2 = 1 / 2; // 0.5
const POS_3 = 5 / 6; // 0.8333...

const CALIBRATION_POINTS: CalibrationPoint[] = [
  { x: POS_1, y: POS_1 },
  { x: POS_2, y: POS_1 },
  { x: POS_3, y: POS_1 },
  { x: POS_1, y: POS_2 },
  { x: POS_2, y: POS_2 },
  { x: POS_3, y: POS_2 },
  { x: POS_1, y: POS_3 },
  { x: POS_2, y: POS_3 },
  { x: POS_3, y: POS_3 },
];

const SAMPLE_INTERVAL_MS = 16;
const POINT_TIMEOUT_MS = 10000;
const MAX_SAMPLES_FOR_TRAINING = 450;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function inferViewport(
  samples: CalibrationSample[],
  fallbackWidth: number,
  fallbackHeight: number,
): { width: number; height: number } {
  if (samples.length === 0) {
    return { width: fallbackWidth, height: fallbackHeight };
  }

  const maxX = Math.max(...samples.map((sample) => sample.screenX), fallbackWidth * 0.9);
  const maxY = Math.max(...samples.map((sample) => sample.screenY), fallbackHeight * 0.9);

  return {
    width: Math.max(1, Math.round(maxX / 0.9)),
    height: Math.max(1, Math.round(maxY / 0.9)),
  };
}

function normalizeSamplesToViewport(
  samples: CalibrationSample[],
  targetWidth: number,
  targetHeight: number,
): CalibrationSample[] {
  const inferred = inferViewport(samples, targetWidth, targetHeight);

  return samples.map((sample) => {
    const sourceWidth = sample.viewportWidth && sample.viewportWidth > 0
      ? sample.viewportWidth
      : inferred.width;
    const sourceHeight = sample.viewportHeight && sample.viewportHeight > 0
      ? sample.viewportHeight
      : inferred.height;

    const normalizedX = clamp01(sample.screenX / sourceWidth);
    const normalizedY = clamp01(sample.screenY / sourceHeight);

    return {
      ...sample,
      screenX: normalizedX * targetWidth,
      screenY: normalizedY * targetHeight,
      viewportWidth: targetWidth,
      viewportHeight: targetHeight,
    };
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffleArray<T>(array: T[]): T[] {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      controller.abort();
      reject(new Error(errorMessage));
    }, timeoutMs);

    task(controller.signal)
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

async function* createFeatureStream(
  getLatestFeatures: () => GazeFeatures | null,
  signal?: AbortSignal,
): AsyncGenerator<GazeFeatures> {
  while (!signal?.aborted) {
    const features = getLatestFeatures();
    if (features) {
      yield features;
    }
    await sleep(SAMPLE_INTERVAL_MS);
  }
}

export function CalibrationPanel({ cameraReady, onModelApplied }: CalibrationPanelProps) {
  const { setModel, stats, getLatestFeatures, getEarThreshold } = useGaze();
  const user = useAuthStore((state) => state.user);
  const activeUserKey = user?.id || user?.email || undefined;
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [targetRounds, setTargetRounds] = useState(1);
  const [currentPoint, setCurrentPoint] = useState<CalibrationPoint | null>(null);
  const [trainingMae, setTrainingMae] = useState<number | null>(null);
  const [message, setMessage] = useState("Chưa chạy calibration");
  const [storedSampleCount, setStoredSampleCount] = useState(0);
  const [storedRounds, setStoredRounds] = useState(0);
  const [isResetConfirming, setIsResetConfirming] = useState(false);

  const refreshStoredStats = useCallback(async () => {
    const stored = await getCalibrationLocally(activeUserKey);
    if (activeUserKey && stored?.sampleCount) {
      try {
        const res = await api.get<{ calibrationPoints?: number }>('/weights/me');
        const serverPoints = res.data?.calibrationPoints ?? 0;
        if (serverPoints === 0 || stored.sampleCount > serverPoints) {
          await resetCalibrationLocally(activeUserKey);
          setStoredSampleCount(0);
          setStoredRounds(0);
          return;
        }
      } catch {
        // Ignore network/auth errors and fall back to local stats
      }
    }
    setStoredSampleCount(stored?.sampleCount ?? 0);
    setStoredRounds(stored?.rounds ?? 0);
  }, [activeUserKey]);

  useEffect(() => {
    void refreshStoredStats();
  }, [refreshStoredStats]);

  const totalPointsPerRound = CALIBRATION_POINTS.length;
  const overlayPoint = useMemo(() => {
    if (!isRunning || !currentPoint) return null;
    return currentPoint;
  }, [currentPoint, isRunning]);

  const runCalibration = useCallback(async () => {
    if (!cameraReady) {
      setMessage("Cần bật camera trước khi calibration");
      return;
    }
    if (!stats?.singleFaceReady) {
      setMessage("Calibration yêu cầu duy nhất 1 khuôn mặt trong khung hình");
      return;
    }

    setIsRunning(true);
    setCurrentRound(0);
    setCurrentPoint(null);
    setTrainingMae(null);
    setMessage("Đang thu thập dữ liệu calibration...");

    const session = new CalibrationSession();
    let round = 0;

    try {
      while (round < targetRounds) {
        round += 1;
        setCurrentRound(round);

        const shuffledPoints = shuffleArray(CALIBRATION_POINTS);
        for (let index = 0; index < totalPointsPerRound; index += 1) {
          const target = shuffledPoints[index];
          setCurrentPoint(target);
          setMessage(`Vòng ${round}/${targetRounds}: điểm ${index + 1}/${totalPointsPerRound}`);

          await withTimeout(
            (signal) =>
              session.collectPoint(
                target.x * window.innerWidth,
                target.y * window.innerHeight,
                createFeatureStream(getLatestFeatures, signal),
                signal,
                getEarThreshold()
              ),
            POINT_TIMEOUT_MS,
            "Hết thời gian lấy mẫu cho một điểm, vui lòng thử lại"
          );
        }
        setCurrentPoint(null);
      }

      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;

      const newSamplesRaw = session.getSamples();
      const newSamples: CalibrationSample[] = newSamplesRaw.map((sample) => ({
        ...sample,
        viewportWidth: currentWidth,
        viewportHeight: currentHeight,
        ...(activeUserKey ? { userId: activeUserKey } : {}),
      }));

      if (newSamples.length < totalPointsPerRound) {
        throw new Error("Không đủ dữ liệu calibration để train model");
      }

      const previousSamplesRaw = await getCalibrationSamplesLocally(activeUserKey);
      const previousStored = await getCalibrationLocally(activeUserKey);

      let serverCalibrationPoints: number | null = null;
      if (activeUserKey) {
        try {
          const weightsRes = await api.get<{ calibrationPoints?: number }>('/weights/me');
          serverCalibrationPoints = weightsRes.data?.calibrationPoints ?? 0;
        } catch {
          serverCalibrationPoints = null;
        }
      }

      const matchingUserSamples = activeUserKey
        ? previousSamplesRaw.filter((sample) => !sample.userId || sample.userId === activeUserKey)
        : previousSamplesRaw;

      const isStaleComparedToServer =
        serverCalibrationPoints !== null &&
        (serverCalibrationPoints === 0 || matchingUserSamples.length > serverCalibrationPoints);

      const canMergePrevious =
        !isStaleComparedToServer &&
        matchingUserSamples.length > 0 &&
        matchingUserSamples.length === previousSamplesRaw.length;

      const previousSamples = canMergePrevious ? matchingUserSamples : [];
      const previousRounds = canMergePrevious ? (previousStored?.rounds ?? 0) : 0;

      // Tự động gộp mẫu thông minh không dùng window.confirm
      let trainingSamples: CalibrationSample[] = [...previousSamples, ...newSamples];
      const totalRounds = previousRounds + round;

      if (trainingSamples.length > MAX_SAMPLES_FOR_TRAINING) {
        trainingSamples = trainingSamples.slice(
          trainingSamples.length - MAX_SAMPLES_FOR_TRAINING
        );
      }

      trainingSamples = normalizeSamplesToViewport(trainingSamples, currentWidth, currentHeight);

      setMessage("Đang giải nghiệm 18D Huber Ridge SVD (< 2ms)...");
      await saveCalibrationSamplesLocally(trainingSamples, totalRounds, activeUserKey);

      const polynomial = new PolynomialGazeMapper();
      const fitResult = polynomial.fit(trainingSamples);
      const polyWeights = polynomial.serialize();

      setTrainingMae(fitResult.mae2D);

      await api.put('/weights/poly', {
        coeffsX: polyWeights.coeffsX,
        coeffsY: polyWeights.coeffsY,
        calibrationPoints: trainingSamples.length,
        earThreshold: getEarThreshold(),
      });

      await api.put('/weights/stats', {
        calibrationPoints: trainingSamples.length,
        lastMaePixels: fitResult.mae2D,
        earThreshold: getEarThreshold(),
      });

      await setModel("polynomial", polyWeights);
      onModelApplied("polynomial");
      markGazeWeightsUpdated();

      await refreshStoredStats();
      setMessage(
        `Hiệu chuẩn thành công! MAE 2D: ${fitResult.mae2D.toFixed(1)}px (${trainingSamples.length} mẫu, ${totalRounds} vòng)`
      );
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = err?.response?.data?.message || err?.message || "Calibration thất bại";
      console.error("[Calibration Error]", error);
      setMessage(`Lỗi: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
    } finally {
      setCurrentPoint(null);
      setIsRunning(false);
    }
  }, [
    activeUserKey,
    cameraReady,
    getEarThreshold,
    getLatestFeatures,
    onModelApplied,
    refreshStoredStats,
    setModel,
    stats?.singleFaceReady,
    targetRounds,
    totalPointsPerRound,
  ]);

  const resetCalibration = useCallback(async () => {
    if (isRunning) return;

    await api.delete('/weights/me').catch(() => {});
    await resetCalibrationLocally(activeUserKey);
    await setModel("none");
    onModelApplied("fallback");
    setTrainingMae(null);
    setCurrentRound(0);
    setCurrentPoint(null);
    setIsResetConfirming(false);
    setMessage("Đã reset dữ liệu calibration. Hệ thống đang ở fallback mode.");
    await refreshStoredStats();
  }, [activeUserKey, isRunning, onModelApplied, refreshStoredStats, setModel]);

  return (
    <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <p className="text-sm text-neutral-300">
        Hiệu chỉnh 18D Huber Ridge SVD theo giải phẫu mắt và tư thế đầu của bạn.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void runCalibration()}
          disabled={isRunning || !cameraReady}
          className="rounded-md bg-cyan-400 px-4 py-2 font-medium text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? `Đang chạy vòng ${currentRound}/${targetRounds}...` : "Bắt đầu Calibration"}
        </button>

        {!isRunning && (
          <div className="flex items-center gap-1.5 text-xs text-neutral-300">
            <span>Số vòng:</span>
            {[1, 2, 3].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTargetRounds(r)}
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  targetRounds === r
                    ? "bg-cyan-500 text-black"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {!isResetConfirming ? (
          <button
            onClick={() => setIsResetConfirming(true)}
            disabled={isRunning}
            className="rounded-md border border-red-500/60 bg-red-900/30 px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-800/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset Data
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void resetCalibration()}
              className="rounded-md bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-500"
            >
              Xác nhận xóa
            </button>
            <button
              onClick={() => setIsResetConfirming(false)}
              className="rounded-md border border-neutral-700 px-2.5 py-2 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              Hủy
            </button>
          </div>
        )}

        <span className="text-xs text-neutral-400">Mỗi vòng: {totalPointsPerRound} điểm</span>
        <span className="text-xs text-neutral-400">
          Đã lưu: {storedSampleCount} mẫu / {storedRounds} vòng
        </span>
        {trainingMae !== null && (
          <span className="text-xs text-emerald-300">
            Huber MAE 2D: {trainingMae.toFixed(1)} px
          </span>
        )}
      </div>

      <p className="text-sm text-neutral-200">{message}</p>

      {isRunning && (
        <p className="text-xs text-amber-300">
          Đang chạy vòng {currentRound}/{targetRounds}. Giữ mắt nhìn tập trung vào hồng tâm đang hiển thị.
        </p>
      )}

      {overlayPoint && (
        <div className="pointer-events-none fixed inset-0 z-[99990]">
          <div
            className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-400/90 shadow-[0_0_24px_rgba(34,211,238,0.9)] animate-pulse"
            style={{ left: `${overlayPoint.x * 100}%`, top: `${overlayPoint.y * 100}%` }}
          />
          <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-md bg-black/80 px-3.5 py-2 text-xs font-medium text-white shadow-lg">
            Giữ mắt vào điểm tròn, hạn chế chớp mắt
          </div>
        </div>
      )}
    </div>
  );
}
