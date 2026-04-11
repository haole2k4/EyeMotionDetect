"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalibrationSession } from "../../lib/gaze/calibration";
import { GazeMLPModel } from "../../lib/gaze/mlp-model";
import { PolynomialGazeMapper } from "../../lib/gaze/polynomial";
import {
  getCalibrationLocally,
  getCalibrationSamplesLocally,
  resetCalibrationLocally,
  saveCalibrationLocally,
  saveCalibrationSamplesLocally,
  saveMLPLocally,
} from "../../lib/gaze/storage";
import type { CalibrationSample, GazeFeatures } from "../../lib/gaze/types";
import { useGaze } from "./GazeProvider";

type Mode = "fallback" | "polynomial" | "mlp";

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
  { x: POS_1, y: POS_1 }, // Row 0, Col 0
  { x: POS_2, y: POS_1 }, // Row 0, Col 1
  { x: POS_3, y: POS_1 }, // Row 0, Col 2
  { x: POS_1, y: POS_2 }, // Row 1, Col 0
  { x: POS_2, y: POS_2 }, // Row 1, Col 1
  { x: POS_3, y: POS_2 }, // Row 1, Col 2
  { x: POS_1, y: POS_3 }, // Row 2, Col 0
  { x: POS_2, y: POS_3 }, // Row 2, Col 1
  { x: POS_3, y: POS_3 }, // Row 2, Col 2
];

const SAMPLE_INTERVAL_MS = 16;
const POINT_TIMEOUT_MS = 10000;
const MAX_ROUNDS = 5;
const EAR_THRESHOLD = 0.18;
const MAX_SAMPLES_FOR_TRAINING = 900;

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
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentPoint, setCurrentPoint] = useState<CalibrationPoint | null>(null);
  const [trainingMae, setTrainingMae] = useState<number | null>(null);
  const [message, setMessage] = useState("Chưa chạy calibration");
  const [storedSampleCount, setStoredSampleCount] = useState(0);
  const [storedRounds, setStoredRounds] = useState(0);

  const refreshStoredStats = useCallback(async () => {
    const stored = await getCalibrationLocally();
    setStoredSampleCount(stored?.sampleCount ?? 0);
    setStoredRounds(stored?.rounds ?? 0);
  }, []);

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
      let continueRounds = true;
      while (continueRounds && round < MAX_ROUNDS) {
        round += 1;
        setCurrentRound(round);

          const shuffledPoints = shuffleArray(CALIBRATION_POINTS);
          for (let index = 0; index < totalPointsPerRound; index += 1) {
            const target = shuffledPoints[index];
            setCurrentPoint(target);
            setMessage(`Vòng ${round}: điểm ${index + 1}/${totalPointsPerRound}`);

            await withTimeout(
              (signal) => session.collectPoint(
                target.x * window.innerWidth,
                target.y * window.innerHeight,
                createFeatureStream(getLatestFeatures, signal),
                signal,
                getEarThreshold()              ),
              POINT_TIMEOUT_MS,
              "Hết thời gian lấy mẫu cho một điểm, vui lòng thử lại"
            );
          }        setCurrentPoint(null);
        continueRounds =
          round < MAX_ROUNDS &&
          window.confirm(`Đã hoàn thành vòng ${round}. Bạn có muốn tiếp tục thêm 1 vòng calibration nữa không?`);
      }

      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;

      const newSamplesRaw = session.getSamples();
      const newSamples: CalibrationSample[] = newSamplesRaw.map((sample) => ({
        ...sample,
        viewportWidth: currentWidth,
        viewportHeight: currentHeight,
      }));

      if (newSamples.length < totalPointsPerRound) {
        throw new Error("Không đủ dữ liệu calibration để train model");
      }

      const previousSamples = await getCalibrationSamplesLocally();
      const previousStored = await getCalibrationLocally();

      let trainingSamples: CalibrationSample[] = [...newSamples];
      let totalRounds = round;

      if (previousSamples.length > 0) {
        const shouldMerge = window.confirm(
          `Đã tìm thấy ${previousSamples.length} mẫu calibration cũ. Bạn có muốn gộp vào lần train này không?`,
        );

        if (shouldMerge) {
          trainingSamples = [...previousSamples, ...newSamples];
          if (trainingSamples.length > MAX_SAMPLES_FOR_TRAINING) {
            trainingSamples = trainingSamples.slice(trainingSamples.length - MAX_SAMPLES_FOR_TRAINING);
          }
          totalRounds = (previousStored?.rounds ?? 0) + round;
        }
      }

      trainingSamples = normalizeSamplesToViewport(trainingSamples, currentWidth, currentHeight);

  setMessage("Đang lưu mẫu và huấn luyện polynomial...");
      await saveCalibrationSamplesLocally(trainingSamples, totalRounds);

      const polynomial = new PolynomialGazeMapper();
      polynomial.fit(trainingSamples);
      const polyWeights = polynomial.serialize();
      await saveCalibrationLocally(
        polyWeights.coeffsX,
        polyWeights.coeffsY,
        EAR_THRESHOLD,
        trainingSamples.length,
        totalRounds,
      );
      await setModel("polynomial", polyWeights);
      onModelApplied("polynomial");

      setMessage("Đang huấn luyện MLP...");
      await GazeMLPModel.ensureBackendReady();
      const mlp = new GazeMLPModel();
      mlp.build();
      await mlp.train(trainingSamples, currentWidth, currentHeight, (_, mae) => {
        setTrainingMae(mae);
      });
      const serialized = await mlp.serialize();

      await saveMLPLocally(
        serialized.json,
        serialized.weights,
        EAR_THRESHOLD,
        trainingSamples.length,
        totalRounds,
      );
      await setModel("mlp", serialized);
      onModelApplied("mlp");

      await refreshStoredStats();
      setMessage(`Calibration thành công: ${trainingSamples.length} mẫu train, tổng ${totalRounds} vòng`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Calibration thất bại";
      setMessage(msg);
    } finally {
      setCurrentPoint(null);
      setIsRunning(false);
    }
  }, [
    cameraReady,
    getEarThreshold,
    getLatestFeatures,
    onModelApplied,
    refreshStoredStats,
    setModel,
    stats?.singleFaceReady,
    totalPointsPerRound,
  ]);

  const resetCalibration = useCallback(async () => {
    if (isRunning) return;

    const ok = window.confirm("Bạn chắc chắn muốn xóa toàn bộ dữ liệu calibration và model đã lưu?");
    if (!ok) return;

    await resetCalibrationLocally();
    await setModel("none");
    onModelApplied("fallback");
    setTrainingMae(null);
    setCurrentRound(0);
    setCurrentPoint(null);
    setMessage("Đã reset dữ liệu calibration. Hệ thống đang ở fallback mode.");
    await refreshStoredStats();
  }, [isRunning, onModelApplied, refreshStoredStats, setModel]);

  return (
    <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <p className="text-sm text-neutral-300">Hiệu chỉnh để huấn luyện model theo mắt của bạn.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void runCalibration()}
          disabled={isRunning || !cameraReady}
          className="rounded-md bg-cyan-400 px-4 py-2 font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          Bắt đầu Calibration
        </button>
        <button
          onClick={() => void resetCalibration()}
          disabled={isRunning}
          className="rounded-md border border-red-500/60 bg-red-900/30 px-4 py-2 font-medium text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reset Calibration Data
        </button>
        <span className="text-xs text-neutral-400">Mỗi vòng: {totalPointsPerRound} điểm</span>
        <span className="text-xs text-neutral-400">Đã lưu: {storedSampleCount} mẫu / {storedRounds} vòng</span>
        {trainingMae !== null && (
          <span className="text-xs text-emerald-300">MLP MAE: {trainingMae.toFixed(1)} px</span>
        )}
      </div>

      <p className="text-sm text-neutral-200">{message}</p>

      {isRunning && (
        <p className="text-xs text-amber-300">
          Đang chạy vòng {currentRound}. Sau mỗi vòng hệ thống sẽ hỏi bạn có muốn tiếp tục hay không.
        </p>
      )}

      {overlayPoint && (
        <div className="pointer-events-none fixed inset-0 z-[99990]">
          <div
            className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-400/90 shadow-[0_0_18px_rgba(34,211,238,0.7)]"
            style={{ left: `${overlayPoint.x * 100}%`, top: `${overlayPoint.y * 100}%` }}
          />
          <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-md bg-black/70 px-3 py-2 text-xs text-white">
            Giữ mắt vào điểm tròn, hạn chế chớp mắt
          </div>
        </div>
      )}
    </div>
  );
}
