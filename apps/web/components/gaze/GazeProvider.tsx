"use client";

import * as Comlink from 'comlink';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AdaptiveEARDetector, type BlinkAction } from '../../lib/gaze/ear-detector';
import { WebCursorController } from '../../lib/gaze/mouse-controller';
import { GazeSmoother } from '../../lib/gaze/smoother';
import type { GazeFeatures } from '../../lib/gaze/types';
import type { GazeWorker } from '../../workers/gaze.worker';
import { getGridCell, getActionFromGrid } from '../../lib/gaze/grid-mapper';

type Point2D = [number, number];

interface EyeOverlay {
  leftEye: Point2D[];
  rightEye: Point2D[];
  leftIris: Point2D[];
  rightIris: Point2D[];
}

const RAW_GAZE_MAX_STEP_PX = 120;
const IRIS_AMPLIFICATION = 1.45;
const DEFAULT_DWELL_REQUIREMENT_MS = 3000;
const SUBMIT_DWELL_REQUIREMENT_MS = 4000;
const STATS_PUBLISH_INTERVAL_MS = 80;
const DWELL_CLICK_COOLDOWN_MS = 250;
const PIPELINE_INIT_DELAY_MS = 700;

function stabilizeRawGaze(nextRaw: Point2D, prevRaw: Point2D, hasPrev: boolean, maxStepPx: number): Point2D {
  if (!hasPrev) return nextRaw;

  const dx = nextRaw[0] - prevRaw[0];
  const dy = nextRaw[1] - prevRaw[1];
  const distance = Math.hypot(dx, dy);
  if (distance <= maxStepPx || distance === 0) return nextRaw;

  const ratio = maxStepPx / distance;
  return [prevRaw[0] + dx * ratio, prevRaw[1] + dy * ratio];
}

export type RegionId = 'A' | 'B' | 'C' | 'D' | 'DEADZONE' | 'PREV' | 'NEXT' | 'SUBMIT' | 'SAFE_MARGIN';

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
  currentRegion: RegionId;
  dwellProgress: number;
}


interface GazeContextType {
  stats: DebugStats | null;
  isInitializing: boolean;
  isEngineReady: boolean;
  initializationError: string | null;
  startPipeline: (video: HTMLVideoElement) => void;
  stopPipeline: () => void;
  setModel: (modelType: 'polynomial' | 'mlp' | 'none', weights?: PolynomialWeights | MLPWeights) => Promise<void>;
  setInteractionMode: (mode: 'default' | 'confirm') => void;
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
  const [isInitializing, setIsInitializing] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workerRef = useRef<Comlink.Remote<GazeWorker> | null>(null);
  const mouseControllerRef = useRef<WebCursorController | null>(null);
  const mountedRef = useRef(true);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const engineReadyRef = useRef(false);

  const earDetectorRef = useRef(new AdaptiveEARDetector());
  const smootherRef = useRef(new GazeSmoother());

  const activeModelRef = useRef<'polynomial' | 'mlp' | 'none'>('none');
  const interactionModeRef = useRef<'default' | 'confirm'>('default');

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const framesRef = useRef<number>(0);
  const fpsRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const lastRawGazeRef = useRef<[number, number]>([0, 0]);
  const hasRawGazeRef = useRef<boolean>(false);
  const latestFeaturesRef = useRef<GazeFeatures | null>(null);

  const regionRef = useRef<RegionId>('DEADZONE');
  const dwellStartRef = useRef<number | null>(null);
  const currentDwellProgressRef = useRef<number>(0);
  const lastStatsPublishRef = useRef<number>(0);
  const lastDwellClickAtRef = useRef<number>(0);

  const getEarThreshold = useCallback(() => {
    return earDetectorRef.current.getThreshold();
  }, []);

  const ensureEngineInitialized = useCallback(async () => {
    if (engineReadyRef.current || !workerRef.current) return;
    if (initPromiseRef.current) return initPromiseRef.current;

    if (mountedRef.current) {
      setIsInitializing(true);
      setInitializationError(null);
    }

    initPromiseRef.current = workerRef.current
      .initialize()
      .then(() => {
        engineReadyRef.current = true;
        if (mountedRef.current) {
          setIsEngineReady(true);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Khoi tao worker that bai';
        if (mountedRef.current) {
          setInitializationError(message);
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsInitializing(false);
        }
        initPromiseRef.current = null;
      });

    return initPromiseRef.current;
  }, []);

  const stopPipeline = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const worker = new Worker(new URL('../../workers/gaze.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = Comlink.wrap<GazeWorker>(worker);

    mouseControllerRef.current = new WebCursorController();
    const initTimer = window.setTimeout(() => {
      void ensureEngineInitialized();
    }, PIPELINE_INIT_DELAY_MS);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(initTimer);
      stopPipeline();
      engineReadyRef.current = false;
      setIsEngineReady(false);
      setIsInitializing(false);

      if (workerRef.current) {
        void workerRef.current.shutdown();
      }
      workerRef.current = null;
      worker.terminate();

      if (mouseControllerRef.current) mouseControllerRef.current.destroy();
      mouseControllerRef.current = null;
    };
  }, [ensureEngineInitialized, stopPipeline]);

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
      } else {
        dispatchMouseEvent('mouseup', x, y);
      }
    }
  }, [dispatchMouseEvent]);

  const setInteractionMode = useCallback((mode: 'default' | 'confirm') => {
    interactionModeRef.current = mode;
    regionRef.current = 'DEADZONE';
    dwellStartRef.current = null;
    currentDwellProgressRef.current = 0;
  }, []);

  const loop = useCallback(async () => {
    if (!videoRef.current || !workerRef.current) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    if (!engineReadyRef.current) {
      void ensureEngineInitialized();
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

    const frameStart = performance.now();
    const shouldPublishStats =
      frameStart - lastStatsPublishRef.current >= STATS_PUBLISH_INTERVAL_MS;

    let detection;
    try {
      const frameBitmap = await createImageBitmap(video);
      detection = await workerRef.current.detectFrame(frameBitmap, frameStart, shouldPublishStats);
    } catch {
      latestFeaturesRef.current = null;
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const tMediaPipe = detection.mediapipeMs;

    const w = window.innerWidth;
    const h = window.innerHeight;

    const faceCount = detection.faceCount;
    const singleFaceReady = detection.singleFaceReady;
    const eyeOverlay = detection.eyeOverlay;
    const features = detection.features;

    let activeRawGaze: Point2D = lastRawGazeRef.current;
    let inferenceMs = 0;
    let blinkState: BlinkAction = 'none';

    latestFeaturesRef.current = features;

    if (features) {
      blinkState = earDetectorRef.current.update(features.earLeft, features.earRight, frameStart);

      if (blinkState === 'none' && !features.isOccluded) {
        try {
          const inference = await workerRef.current.inferGaze(
            features,
            w,
            h,
            activeModelRef.current,
            IRIS_AMPLIFICATION,
          );
          activeRawGaze = inference.rawGaze;
          inferenceMs = inference.inferenceMs;
          activeModelRef.current = inference.activeModel;
        } catch {
          activeModelRef.current = 'none';
        }

        activeRawGaze = stabilizeRawGaze(activeRawGaze, lastRawGazeRef.current, hasRawGazeRef.current, RAW_GAZE_MAX_STEP_PX);
        lastRawGazeRef.current = [
          clamp(activeRawGaze[0], 0, w),
          clamp(activeRawGaze[1], 0, h),
        ];
        activeRawGaze = lastRawGazeRef.current;
        hasRawGazeRef.current = true;
      }
    }

    const smoothed = smootherRef.current.update(activeRawGaze[0], activeRawGaze[1]);

    if (mouseControllerRef.current) {
      mouseControllerRef.current.moveTo(smoothed.x, smoothed.y);
    }
    if (singleFaceReady) {
      handleBlinkAction(blinkState, smoothed.x, smoothed.y);
    }

    const { row, col } = getGridCell(smoothed.x, smoothed.y, w, h);
    const mappedRegion = getActionFromGrid(row, col) as RegionId;

    const newRegion: RegionId = interactionModeRef.current === 'confirm'
      ? (mappedRegion === 'SAFE_MARGIN' || mappedRegion === 'NEXT' || mappedRegion === 'DEADZONE'
          ? mappedRegion
          : 'DEADZONE')
      : mappedRegion;

    let currentDwellRequirement = DEFAULT_DWELL_REQUIREMENT_MS;
    if (newRegion === 'SUBMIT') currentDwellRequirement = SUBMIT_DWELL_REQUIREMENT_MS;

    const isSafeZone = interactionModeRef.current === 'confirm'
      ? newRegion === 'DEADZONE'
      : (newRegion === 'DEADZONE' || newRegion === 'SAFE_MARGIN');
    const now = performance.now();

    if (newRegion !== regionRef.current) {
      regionRef.current = newRegion;
      if (!isSafeZone) {
        dwellStartRef.current = now;
      } else {
        dwellStartRef.current = null;
      }
      currentDwellProgressRef.current = 0;
    } else if (!isSafeZone && dwellStartRef.current) {
      const elapsedDwell = now - dwellStartRef.current;
      currentDwellProgressRef.current = Math.min(elapsedDwell / currentDwellRequirement, 1.0);
      if (currentDwellProgressRef.current >= 1.0) {
        if (now - lastDwellClickAtRef.current >= DWELL_CLICK_COOLDOWN_MS) {
          dispatchMouseEvent('click', smoothed.x, smoothed.y);
          lastDwellClickAtRef.current = now;
        }
        dwellStartRef.current = now;
        currentDwellProgressRef.current = 0;
      }
    }

    framesRef.current++;
    const elapsed = now - lastTimeRef.current;
    let currentFps = fpsRef.current;
    if (elapsed >= 1000) {
      currentFps = Math.round((framesRef.current * 1000) / elapsed);
      framesRef.current = 0;
      lastTimeRef.current = now;
      fpsRef.current = currentFps;
    }

    if (shouldPublishStats) {
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
        currentRegion: regionRef.current,
        dwellProgress: currentDwellProgressRef.current,
      });
      lastStatsPublishRef.current = now;
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [dispatchMouseEvent, ensureEngineInitialized, handleBlinkAction]);

  const startPipeline = useCallback((videoElement: HTMLVideoElement) => {
    videoRef.current = videoElement;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    void ensureEngineInitialized();

    smootherRef.current = new GazeSmoother();
    hasRawGazeRef.current = false;
    lastStatsPublishRef.current = 0;
    lastDwellClickAtRef.current = 0;
    lastRawGazeRef.current = [window.innerWidth / 2, window.innerHeight / 2];
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
  }, [ensureEngineInitialized, loop]);

  const setModel = useCallback(async (modelType: 'polynomial' | 'mlp' | 'none', weights?: PolynomialWeights | MLPWeights) => {
    activeModelRef.current = modelType;
    if (!workerRef.current) return;

    await ensureEngineInitialized();

    if (modelType === 'none') {
      workerRef.current.clearPolynomialWeights();
      return;
    }

    if (modelType === 'polynomial' && weights && 'coeffsX' in weights) {
      await workerRef.current.setPolynomialWeights(weights.coeffsX, weights.coeffsY);
      return;
    }

    if (modelType === 'mlp' && weights && 'json' in weights) {
      await workerRef.current.loadMLPModel(weights.json, weights.weights);
    }
  }, [ensureEngineInitialized]);

  const getLatestFeatures = useCallback(() => latestFeaturesRef.current, []);

  return (
    <GazeContext.Provider
      value={{
        stats,
        isInitializing,
        isEngineReady,
        initializationError,
        startPipeline,
        stopPipeline,
        setModel,
        setInteractionMode,
        getLatestFeatures,
        getEarThreshold,
      }}
    >
      {children}
      {isInitializing && (
        <div className="pointer-events-none fixed right-4 bottom-4 z-[99998] rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs text-popover-foreground shadow-lg">
          Đang khởi động hệ thống nhận diện...
        </div>
      )}
      {initializationError && (
        <div className="pointer-events-none fixed right-4 bottom-4 z-[99998] rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-lg">
          Lỗi khởi tạo gaze: {initializationError}
        </div>
      )}
    </GazeContext.Provider>
  );
}
