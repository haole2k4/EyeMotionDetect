"use client";

import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';
import * as Comlink from 'comlink';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AdaptiveEARDetector, type BlinkAction } from '../../lib/gaze/ear-detector';
import { extractFeatures } from '../../lib/gaze/feature-extractor';
import { createFaceLandmarker } from '../../lib/gaze/mediapipe';
import { WebCursorController } from '../../lib/gaze/mouse-controller';
import { GazeSmoother } from '../../lib/gaze/smoother';
import type { GazeFeatures } from '../../lib/gaze/types';
import type { GazeWorker } from '../../workers/gaze.worker';

type Point2D = [number, number];

interface EyeOverlay {
  leftEye: Point2D[];
  rightEye: Point2D[];
  leftIris: Point2D[];
  rightIris: Point2D[];
}

const LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] as const;
const RIGHT_EYE_CONTOUR = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466] as const;
const LEFT_IRIS = [468, 469, 470, 471, 472] as const;
const RIGHT_IRIS = [473, 474, 475, 476, 477] as const;
const RAW_GAZE_MAX_STEP_PX = 120;
const IRIS_AMPLIFICATION = 1.45;

function toPoints(lm: NormalizedLandmark[], indices: readonly number[]): Point2D[] {
  return indices.map((index) => [lm[index].x, lm[index].y]);
}

function buildEyeOverlay(lm: NormalizedLandmark[] | null | undefined): EyeOverlay | null {
  if (!lm) return null;
  return {
    leftEye: toPoints(lm, LEFT_EYE_CONTOUR),
    rightEye: toPoints(lm, RIGHT_EYE_CONTOUR),
    leftIris: toPoints(lm, LEFT_IRIS),
    rightIris: toPoints(lm, RIGHT_IRIS),
  };
}

function stabilizeRawGaze(nextRaw: Point2D, prevRaw: Point2D, hasPrev: boolean, maxStepPx: number): Point2D {
  if (!hasPrev) return nextRaw;

  const dx = nextRaw[0] - prevRaw[0];
  const dy = nextRaw[1] - prevRaw[1];
  const distance = Math.hypot(dx, dy);
  if (distance <= maxStepPx || distance === 0) return nextRaw;

  const ratio = maxStepPx / distance;
  return [prevRaw[0] + dx * ratio, prevRaw[1] + dy * ratio];
}

interface DebugStats {
  fps: number;
  mediapipeMs: number;
  inferenceMs: number;
  activeModel: 'polynomial' | 'mlp' | 'none';
  rawGaze: [number, number];
  smoothedGaze: [number, number];
  earLeft: number;
  earRight: number;
  blinkState: BlinkAction;
  dragEnabled: boolean;
  faceCount: number;
  singleFaceReady: boolean;
  eyeOverlay: EyeOverlay | null;
}

interface GazeContextType {
  stats: DebugStats | null;
  startPipeline: (video: HTMLVideoElement) => void;
  stopPipeline: () => void;
  setModel: (modelType: 'polynomial' | 'mlp' | 'none', weights?: PolynomialWeights | MLPWeights) => Promise<void>;
  getLatestFeatures: () => GazeFeatures | null;
  getEarThreshold: () => number;
}

interface PolynomialWeights {
  coeffsX: number[];
  coeffsY: number[];
}

interface MLPWeights {
  json: string;
  weights: ArrayBuffer;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const GazeContext = createContext<GazeContextType | null>(null);

export const useGaze = () => {
  const context = useContext(GazeContext);
  if (!context) throw new Error('useGaze must be used within GazeProvider');
  return context;
};

export function GazeProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<DebugStats | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const workerRef = useRef<Comlink.Remote<GazeWorker> | null>(null);
  const mouseControllerRef = useRef<WebCursorController | null>(null);

  const earDetectorRef = useRef(new AdaptiveEARDetector());
  const smootherRef = useRef(new GazeSmoother());

  const activeModelRef = useRef<'polynomial' | 'mlp' | 'none'>('none');
  const polyWeightsRef = useRef<{ x: number[], y: number[] } | null>(null);

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const framesRef = useRef<number>(0);
  const fpsRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const lastRawGazeRef = useRef<[number, number]>([0, 0]);
  const hasRawGazeRef = useRef<boolean>(false);
  const latestFeaturesRef = useRef<GazeFeatures | null>(null);
    const getEarThreshold = useCallback(() => {
      return earDetectorRef.current.getThreshold();
    }, []);
  const stopPipeline = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  useEffect(() => {
    // Khởi tạo Worker
    const worker = new Worker(new URL('../../workers/gaze.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = Comlink.wrap<GazeWorker>(worker);
    workerRef.current.initTF();

    // Khởi tạo MediaPipe
    createFaceLandmarker().then(lm => {
      landmarkerRef.current = lm;
    });

    // Khởi tạo Cursor control
    mouseControllerRef.current = new WebCursorController();

    return () => {
      stopPipeline();
      worker.terminate();
      if (mouseControllerRef.current) mouseControllerRef.current.destroy();
      if (landmarkerRef.current) landmarkerRef.current.close();
    };
  }, [stopPipeline]);

  const dispatchMouseEvent = useCallback((type: 'mousedown' | 'mouseup' | 'click' | 'contextmenu', clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return;
    const evt = new MouseEvent(type, {
      clientX, clientY, bubbles: true, cancelable: true, view: window
    });
    el.dispatchEvent(evt);
  }, []);

  const handleBlinkAction = useCallback((action: BlinkAction, x: number, y: number) => {
    if (action === 'none') return;

    if (action === 'left_click') {
      if (!isDraggingRef.current) {
        dispatchMouseEvent('mousedown', x, y);
        dispatchMouseEvent('mouseup', x, y);
        dispatchMouseEvent('click', x, y);
      }
    } else if (action === 'right_click') {
      dispatchMouseEvent('contextmenu', x, y);
    } else if (action === 'drag_toggle') {
      isDraggingRef.current = !isDraggingRef.current;
      if (isDraggingRef.current) {
        dispatchMouseEvent('mousedown', x, y);
        // Thay đổi cảnh báo cho Overlay
        console.log("Mở trạng thái DRAG AND DROP");
      } else {
        dispatchMouseEvent('mouseup', x, y);
        console.log("Đóng trạng thái DRAG AND DROP");
      }
    }
  }, [dispatchMouseEvent]);

  const loop = useCallback(async () => {
    if (!videoRef.current || !landmarkerRef.current || !workerRef.current) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const video = videoRef.current;
    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      latestFeaturesRef.current = null;
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const t0 = performance.now();
    let result;
    try {
      result = landmarkerRef.current.detectForVideo(video, t0);
    } catch {
      latestFeaturesRef.current = null;
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    const tMediaPipe = performance.now() - t0;

    const w = window.innerWidth;
    const h = window.innerHeight;

    const faceCount = result.faceLandmarks?.length ?? 0;
    const singleFaceReady = faceCount === 1;
    const eyeOverlay = singleFaceReady ? buildEyeOverlay(result.faceLandmarks?.[0]) : null;

    const features = singleFaceReady ? extractFeatures(result) : null;

    let activeRawGaze: Point2D = lastRawGazeRef.current;
    let inferenceMs = 0;
    let blinkState: BlinkAction = 'none';

    latestFeaturesRef.current = features;

    if (features) {
      blinkState = earDetectorRef.current.update(features.earLeft, features.earRight, t0);

      // Nếu đang nhắm mắt sâu thì không predict tránh nhảy toạ độ, nội suy từ Smooth cũ
      if (blinkState === 'none' && !features.isOccluded) {
        const t1 = performance.now();
        if (activeModelRef.current === 'mlp') {
          try {
            activeRawGaze = await workerRef.current.runMLP(features, w, h);
          } catch {
            activeModelRef.current = 'none';
          }
        } else if (activeModelRef.current === 'polynomial' && polyWeightsRef.current) {
          activeRawGaze = await workerRef.current.runPolynomial(features, polyWeightsRef.current.x, polyWeightsRef.current.y);
        } else {
          const irisX = (features.irisXLeft + features.irisXRight) / 2;
          const irisY = (features.irisYLeft + features.irisYRight) / 2;
          const amplifiedX = (irisX - 0.5) * IRIS_AMPLIFICATION + 0.5;
          const amplifiedY = (irisY - 0.5) * IRIS_AMPLIFICATION + 0.5;
          activeRawGaze = [
            clamp(amplifiedX * w, 0, w),
            clamp(amplifiedY * h, 0, h),
          ];
        }

        activeRawGaze = stabilizeRawGaze(activeRawGaze, lastRawGazeRef.current, hasRawGazeRef.current, RAW_GAZE_MAX_STEP_PX);
        lastRawGazeRef.current = [
          clamp(activeRawGaze[0], 0, w),
          clamp(activeRawGaze[1], 0, h),
        ];
        activeRawGaze = lastRawGazeRef.current;
        hasRawGazeRef.current = true;
        inferenceMs = performance.now() - t1;
      }
    }

    // Làm mượt toạ độ
    const smoothed = smootherRef.current.update(activeRawGaze[0], activeRawGaze[1]);

    // Cập nhật Cursor và gửi click event
    if (mouseControllerRef.current) {
      mouseControllerRef.current.moveTo(smoothed.x, smoothed.y);
    }
    if (singleFaceReady) {
      handleBlinkAction(blinkState, smoothed.x, smoothed.y);
    }

    // Tính FPS
    framesRef.current++;
    const now = performance.now();
    const elapsed = now - lastTimeRef.current;
    let currentFps = fpsRef.current;
    if (elapsed >= 1000) {
      currentFps = Math.round((framesRef.current * 1000) / elapsed);
      framesRef.current = 0;
      lastTimeRef.current = now;
      fpsRef.current = currentFps;
    }

    setStats({
      fps: currentFps,
      mediapipeMs: tMediaPipe,
      inferenceMs,
      activeModel: activeModelRef.current,
      rawGaze: activeRawGaze,
      smoothedGaze: [smoothed.x, smoothed.y],
      earLeft: features ? features.earLeft : 0,
      earRight: features ? features.earRight : 0,
      blinkState,
      dragEnabled: isDraggingRef.current,
      faceCount,
      singleFaceReady,
      eyeOverlay,
    });

    rafRef.current = requestAnimationFrame(loop);
  }, [handleBlinkAction]);

  const startPipeline = useCallback((videoElement: HTMLVideoElement) => {
    videoRef.current = videoElement;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    smootherRef.current = new GazeSmoother();
    hasRawGazeRef.current = false;
    lastRawGazeRef.current = [window.innerWidth / 2, window.innerHeight / 2];
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const setModel = useCallback(async (modelType: 'polynomial' | 'mlp' | 'none', weights?: PolynomialWeights | MLPWeights) => {
    activeModelRef.current = modelType;
    if (modelType === 'none') {
      polyWeightsRef.current = null;
      return;
    }

    if (modelType === 'polynomial' && weights && 'coeffsX' in weights) {
      polyWeightsRef.current = { x: weights.coeffsX, y: weights.coeffsY };
      return;
    }

    if (modelType === 'mlp' && weights && 'json' in weights && workerRef.current) {
      await workerRef.current.loadMLPModel(weights.json, weights.weights);
    }
  }, []);

  const getLatestFeatures = useCallback(() => latestFeaturesRef.current, []);

  return (
    <GazeContext.Provider value={{ stats, startPipeline, stopPipeline, setModel, getLatestFeatures, getEarThreshold }}>
      {children}
    </GazeContext.Provider>
  );
}
