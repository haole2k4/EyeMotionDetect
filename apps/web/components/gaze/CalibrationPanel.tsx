"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
      toast.error("Cần bật camera trước khi calibration");
      return;
    }
    if (!stats?.singleFaceReady) {
      setMessage("Calibration yêu cầu duy nhất 1 khuôn mặt trong khung hình");
      toast.error("Calibration yêu cầu duy nhất 1 khuôn mặt trong khung hình");
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
      toast.success(
        `Hiệu chuẩn thành công · MAE 2D: ${fitResult.mae2D.toFixed(1)}px`
      );
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = err?.response?.data?.message || err?.message || "Calibration thất bại";
      const errText = typeof msg === "string" ? msg : JSON.stringify(msg);
      console.error("[Calibration Error]", error);
      setMessage(`Lỗi: ${errText}`);
      toast.error(`Hiệu chuẩn thất bại: ${errText}`);
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

    try {
      await api.delete('/weights/me').catch(() => {});
      await resetCalibrationLocally(activeUserKey);
      await setModel("none");
      onModelApplied("fallback");
      setTrainingMae(null);
      setCurrentRound(0);
      setCurrentPoint(null);
      setIsResetConfirming(false);
      setMessage("Đã reset dữ liệu calibration. Hệ thống đang ở fallback mode.");
      toast.success("Đã đặt lại dữ liệu hiệu chuẩn");
      await refreshStoredStats();
    } catch (error) {
      console.error("[Reset Calibration Error]", error);
      toast.error("Không thể đặt lại dữ liệu hiệu chuẩn");
    }
  }, [activeUserKey, isRunning, onModelApplied, refreshStoredStats, setModel]);

  return (
    <div className="space-y-4 rounded-2xl border-2 border-[#D4D4D8] bg-white p-5 md:p-6 text-[#0A0A0A]">
      <p className="text-sm font-medium text-[#3F3F46]">
        Hiệu chỉnh 18D Huber Ridge SVD theo giải phẫu mắt và tư thế đầu của bạn.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void runCalibration()}
          disabled={isRunning || !cameraReady}
          className="min-h-11 rounded-lg bg-[#0052FF] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0040CC] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? `Đang chạy vòng ${currentRound}/${targetRounds}...` : "Bắt đầu Calibration"}
        </button>

        {!isRunning && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#3F3F46]">
            <span>Số vòng:</span>
            {[1, 2, 3].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTargetRounds(r)}
                className={`min-h-9 min-w-9 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  targetRounds === r
                    ? "bg-[#0A0A0A] text-white"
                    : "border border-[#D4D4D8] bg-[#F4F4F5] text-[#0A0A0A] hover:bg-[#E4E4E7]"
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
            className="min-h-11 rounded-lg border-2 border-[#DC2626] bg-white px-4 py-2 text-xs font-semibold text-[#DC2626] transition-colors hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset Data
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => void resetCalibration()}
              className="min-h-11 rounded-lg bg-[#DC2626] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#B91C1C]"
            >
              Xác nhận xóa
            </button>
            <button
              onClick={() => setIsResetConfirming(false)}
              className="min-h-11 rounded-lg border border-[#D4D4D8] bg-white px-3.5 py-2 text-xs font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F4F4F5]"
            >
              Hủy
            </button>
          </div>
        )}

        <span className="text-xs font-medium text-[#52525B] tabular-nums">
          Mỗi vòng: {totalPointsPerRound} điểm
        </span>
        <span className="text-xs font-medium text-[#52525B] tabular-nums">
          Đã lưu: {storedSampleCount} mẫu / {storedRounds} vòng
        </span>
        {trainingMae !== null && (
          <span className="rounded-md border border-[#16A34A] bg-[#F0FDF4] px-2.5 py-1 text-xs font-semibold text-[#14532D] tabular-nums">
            Huber MAE 2D: {trainingMae.toFixed(1)} px
          </span>
        )}
      </div>

      <p className="text-sm font-medium text-[#0A0A0A]">{message}</p>

      {isRunning && (
        <p className="text-xs font-semibold text-[#0052FF]">
          Đang chạy vòng {currentRound}/{targetRounds}. Giữ mắt nhìn tập trung vào hồng tâm đang hiển thị.
        </p>
      )}

      {overlayPoint && (
        <div className="pointer-events-none fixed inset-0 z-[99990] bg-[#F7F7F5]/95">
          <div
            className="absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-[#0A0A0A] bg-[#0052FF]"
            style={{ left: `${overlayPoint.x * 100}%`, top: `${overlayPoint.y * 100}%` }}
          >
            <span className="h-3 w-3 rounded-full bg-white" />
          </div>
          <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-lg bg-[#0A0A0A] px-4 py-2 text-xs font-semibold text-white">
            Giữ mắt vào điểm tròn, hạn chế chớp mắt
          </div>
        </div>
      )}
    </div>
  );
}
