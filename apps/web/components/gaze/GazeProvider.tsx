"use client";

import * as Comlink from 'comlink';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AdaptiveEARDetector, type BlinkAction } from '../../lib/gaze/ear-detector';
import { WebCursorController } from '../../lib/gaze/mouse-controller';
import type { GazeFeatures } from '../../lib/gaze/types';
import type { GazeWorker, UnifiedFrameResult, EyeOverlay } from '../../workers/gaze.worker';
import { getGridCell, getActionFromGrid } from '../../lib/gaze/grid-mapper';
import {
  AccessibilityProfileConfig,
  DEFAULT_ACCESSIBILITY_PROFILE,
  MagneticTargetSpec,
  SharedGazeBuffer,
} from '../../lib/gaze-bridge/engine';

export type RegionId = 'A' | 'B' | 'C' | 'D' | 'DEADZONE' | 'PREV' | 'NEXT' | 'SUBMIT' | 'SAFE_MARGIN';

const DEFAULT_DWELL_REQUIREMENT_MS = 1600;
const SUBMIT_DWELL_REQUIREMENT_MS = 4000;
const FALLBACK_HIT_MARGIN_PX = 24;
const STATS_PUBLISH_INTERVAL_MS = 33;
const DWELL_CLICK_COOLDOWN_MS = 250;
const PIPELINE_INIT_DELAY_MS = 400;

function findFallbackTarget(
  x: number,
  y: number,
  targets: MagneticTargetSpec[]
): MagneticTargetSpec | null {
  let bestTarget: MagneticTargetSpec | null = null;
  let bestEdgeDist = Infinity;
  let bestCenterDist = Infinity;

  for (const t of targets) {
    const dx = x < t.x ? t.x - x : x > t.x + t.width ? x - (t.x + t.width) : 0;
    const dy = y < t.y ? t.y - y : y > t.y + t.height ? y - (t.y + t.height) : 0;
    const edgeDist = Math.hypot(dx, dy);

    if (edgeDist <= FALLBACK_HIT_MARGIN_PX) {
      const centerDist = Math.hypot(x - (t.x + t.width / 2), y - (t.y + t.height / 2));
      if (
        edgeDist < bestEdgeDist ||
        (edgeDist === bestEdgeDist && centerDist < bestCenterDist)
      ) {
        bestTarget = t;
        bestEdgeDist = edgeDist;
        bestCenterDist = centerDist;
      }
    }
  }

  return bestTarget;
}

function resolveTargetClickPoint(
  x: number,
  y: number,
  targetId: number,
  targets: MagneticTargetSpec[]
): [number, number] {
  if (targetId < 0) return [x, y];
  const t = targets.find((item) => item.id === targetId);
  if (t && (x < t.x || x > t.x + t.width || y < t.y || y > t.y + t.height)) {
    return [t.x + t.width / 2, t.y + t.height / 2];
  }
  return [x, y];
}

export interface DebugStats {
  fps: number;
  mediapipeMs: number;
  inferenceMs: number;
  activeModel: 'polynomial' | 'mlp' | 'none';
  rawGaze: [number, number];
  smoothedGaze: [number, number];
  snappedGaze?: [number, number];
  activeTargetKey?: string | null;
  earLeft: number;
  earRight: number;
  blinkState: BlinkAction;
  saccadeEvent?: 'none' | 'next' | 'prev';
  pursuitProgress?: number;
  pursuitConfirmed?: boolean;
  headPoseOk?: boolean;
  lightingScore?: number;
  iod?: number;
  dragEnabled: boolean;
  faceCount: number;
  singleFaceReady: boolean;
  eyeOverlay: EyeOverlay | null;
  currentRegion: RegionId;
  dwellProgress: number;
}

export interface PolynomialWeights {
  coeffsX: number[];
  coeffsY: number[];
}

export interface MLPWeights {
  json?: string;
  weights?: ArrayBuffer;
  coeffsX?: number[];
  coeffsY?: number[];
}

export interface GazeContextType {
  stats: DebugStats | null;
  isInitializing: boolean;
  isEngineReady: boolean;
  initializationError: string | null;
  startPipeline: (video: HTMLVideoElement) => void;
  stopPipeline: () => void;
  setModel: (
    modelType: 'polynomial' | 'mlp' | 'none',
    weights?: PolynomialWeights | MLPWeights
  ) => Promise<void>;
  setInteractionMode: (mode: 'default' | 'confirm') => void;
  getLatestFeatures: () => GazeFeatures | null;
  getEarThreshold: () => number;
  // Các hàm mới cho Giai đoạn 3 & 4:
  registerMagneticTargets?: (targets: MagneticTargetSpec[]) => void;
  clearMagneticTargets?: () => void;
  recordImplicitDrift?: (targetX: number, targetY: number) => void;
  setPursuitOrbitTarget?: (target: { x: number; y: number; radius?: number } | null) => void;
  resetDwell?: (cooldownMs?: number) => void;
  accessibilityProfile?: AccessibilityProfileConfig;
  setAccessibilityProfile?: (profile: Partial<AccessibilityProfileConfig>) => void;
}

class SpringInterpolator2D {
  public x = 0;
  public y = 0;
  private vx = 0;
  private vy = 0;
  private initialized = false;
  private readonly stiffness = 280;
  private readonly damping = 2 * Math.sqrt(280);

  update(targetX: number, targetY: number, dtSec: number): [number, number] {
    if (!this.initialized) {
      this.x = targetX;
      this.y = targetY;
      this.initialized = true;
      return [this.x, this.y];
    }
    const dt = Math.max(0.001, Math.min(0.05, dtSec));
    const ax = this.stiffness * (targetX - this.x) - this.damping * this.vx;
    const ay = this.stiffness * (targetY - this.y) - this.damping * this.vy;

    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    return [this.x, this.y];
  }

  reset(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.initialized = true;
  }
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
  const [isPipelineActive, setIsPipelineActive] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [accessibilityProfile, setAccessibilityProfileState] = useState<AccessibilityProfileConfig>(
    DEFAULT_ACCESSIBILITY_PROFILE
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workerRef = useRef<Comlink.Remote<GazeWorker> | null>(null);
  const mouseControllerRef = useRef<WebCursorController | null>(null);
  const mountedRef = useRef(true);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const engineReadyRef = useRef(false);
  const isPipelineActiveRef = useRef(false);

  const earDetectorRef = useRef(new AdaptiveEARDetector());
  const springRef = useRef(new SpringInterpolator2D());
  const sharedBufferRef = useRef<SharedGazeBuffer | null>(null);

  const activeModelRef = useRef<'polynomial' | 'mlp' | 'none'>('none');
  const interactionModeRef = useRef<'default' | 'confirm'>('default');

  const inferenceRafRef = useRef<number>(0);
  const renderRafRef = useRef<number>(0);
  const isProcessingFrameRef = useRef<boolean>(false);

  const targetGazeRef = useRef<[number, number]>([0, 0]);
  const isSnappedRef = useRef<boolean>(false);
  const activeTargetIdRef = useRef<number>(-1);
  const targetMapRef = useRef<Map<number, string>>(new Map());
  const registeredTargetsRef = useRef<MagneticTargetSpec[]>([]);
  const accessibilityProfileRef = useRef<AccessibilityProfileConfig>(DEFAULT_ACCESSIBILITY_PROFILE);

  useEffect(() => {
    accessibilityProfileRef.current = accessibilityProfile;
  }, [accessibilityProfile]);

  const latestUnifiedResultRef = useRef<UnifiedFrameResult | null>(null);
  const latestFeaturesRef = useRef<GazeFeatures | null>(null);

  const framesRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(performance.now());
  const fpsRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);

  const regionRef = useRef<RegionId>('DEADZONE');
  const dwellStartRef = useRef<number | null>(null);
  const currentDwellProgressRef = useRef<number>(0);
  const dwellCooldownUntilRef = useRef<number>(0);
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
        if (sharedBufferRef.current && workerRef.current) {
          void workerRef.current.initSharedBuffer(sharedBufferRef.current.buffer);
        }
        if (mountedRef.current) {
          setIsEngineReady(true);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Khởi tạo worker thất bại';
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

  const dispatchMouseEvent = useCallback((type: 'mousedown' | 'mouseup' | 'click' | 'contextmenu', clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return;
    const evt = new MouseEvent(type, {
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
      view: window,
    });
    el.dispatchEvent(evt);
  }, []);

  const handleBlinkAction = useCallback((action: BlinkAction, x: number, y: number) => {
    if (action === 'none') return;

    if (mouseControllerRef.current) {
      mouseControllerRef.current.flashClickEffect();
    }

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

  const setAccessibilityProfile = useCallback((profile: Partial<AccessibilityProfileConfig>) => {
    setAccessibilityProfileState((prev) => {
      const next = { ...prev, ...profile };
      accessibilityProfileRef.current = next;
      if (workerRef.current) {
        void workerRef.current.setAccessibilityConfig(next);
      }
      return next;
    });
  }, []);

  const recordImplicitDrift = useCallback((targetX: number, targetY: number) => {
    const currentPred = targetGazeRef.current;
    if (workerRef.current) {
      void workerRef.current.addDriftSample(currentPred[0], currentPred[1], targetX, targetY, 1.0);
    }
  }, []);

  const setPursuitOrbitTarget = useCallback((target: { x: number; y: number; radius?: number } | null) => {
    if (workerRef.current) {
      if (target) {
        void workerRef.current.setPursuitTarget(target.x, target.y, target.radius ?? 40.0, 1200.0);
      } else {
        void workerRef.current.setPursuitTarget(-9999, -9999, 0, 1200.0);
      }
    }
  }, []);

  const resetDwell = useCallback((cooldownMs = 0) => {
    dwellStartRef.current = null;
    currentDwellProgressRef.current = 0;
    dwellCooldownUntilRef.current = cooldownMs > 0 ? performance.now() + cooldownMs : 0;
  }, []);

  // VÒNG LẶP 1: Inference loop (~30 FPS, bảo vệ Zero-Jank bằng isProcessingFrameRef)
  const lastInferenceTimeRef = useRef<number>(performance.now());
  const runInferenceLoop = useCallback(async () => {
    if (!videoRef.current || !workerRef.current) {
      inferenceRafRef.current = requestAnimationFrame(runInferenceLoop);
      return;
    }

    if (!engineReadyRef.current) {
      void ensureEngineInitialized();
      inferenceRafRef.current = requestAnimationFrame(runInferenceLoop);
      return;
    }

    const video = videoRef.current;
    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0 ||
      isProcessingFrameRef.current
    ) {
      inferenceRafRef.current = requestAnimationFrame(runInferenceLoop);
      return;
    }

    isProcessingFrameRef.current = true;
    const now = performance.now();
    const dtSec = Math.max(0.016, (now - lastInferenceTimeRef.current) / 1000);
    lastInferenceTimeRef.current = now;

    try {
      const frameBitmap = await createImageBitmap(video);
      const w = window.innerWidth;
      const h = window.innerHeight;

      const unifiedResult = await workerRef.current.processFrameUnified(
        frameBitmap,
        now,
        dtSec,
        w,
        h,
        true
      );

      latestUnifiedResultRef.current = unifiedResult;
      latestFeaturesRef.current = unifiedResult.features;

      if (unifiedResult.isValid) {
        const isSnapped = unifiedResult.activeTargetId >= 0;
        const targetCoord = isSnapped ? unifiedResult.snappedGaze : unifiedResult.rawGaze;
        targetGazeRef.current = targetCoord;
        isSnappedRef.current = isSnapped;
        activeTargetIdRef.current = unifiedResult.activeTargetId;

        if (unifiedResult.blinkEvent !== 'none') {
          const [blinkX, blinkY] = resolveTargetClickPoint(
            targetCoord[0],
            targetCoord[1],
            unifiedResult.activeTargetId,
            registeredTargetsRef.current
          );
          handleBlinkAction(unifiedResult.blinkEvent, blinkX, blinkY);
        }
      }
    } catch {
      // Bỏ qua lỗi frame đơn lẻ
    } finally {
      isProcessingFrameRef.current = false;
      inferenceRafRef.current = requestAnimationFrame(runInferenceLoop);
    }
  }, [ensureEngineInitialized, handleBlinkAction]);

  // VÒNG LẶP 2: 144Hz Smooth Cursor Render Loop
  const lastRenderTimeRef = useRef<number>(performance.now());
  const runRenderCursorLoop = useCallback(() => {
    const now = performance.now();
    const dtSec = (now - lastRenderTimeRef.current) / 1000;
    lastRenderTimeRef.current = now;

    let targetX = targetGazeRef.current[0];
    let targetY = targetGazeRef.current[1];
    let snapped = isSnappedRef.current;
    let activeTargetId = activeTargetIdRef.current;

    // Zero-copy SharedBuffer path
    if (sharedBufferRef.current && sharedBufferRef.current.isShared) {
      const snap = sharedBufferRef.current.readSnapshot();
      if (snap.isValid) {
        snapped = snap.activeTargetId >= 0;
        activeTargetId = snap.activeTargetId;
        activeTargetIdRef.current = snap.activeTargetId;
        targetX = snapped ? snap.snappedX : snap.smoothX || snap.filteredX || snap.rawX;
        targetY = snapped ? snap.snappedY : snap.smoothY || snap.filteredY || snap.rawY;
      }
    }

    const [cursorX, cursorY] = springRef.current.update(targetX, targetY, dtSec);

    let fallbackKey: string | null = null;
    if (activeTargetId < 0 && registeredTargetsRef.current.length > 0) {
      const matched = findFallbackTarget(cursorX, cursorY, registeredTargetsRef.current);
      if (matched) {
        activeTargetId = matched.id;
        snapped = true;
        fallbackKey = matched.key;
      }
    }

    if (mouseControllerRef.current) {
      mouseControllerRef.current.moveTo(cursorX, cursorY, snapped);
    }

    // Prioritize magnetic target key over fallback grid cell so dwell sweep matches snapped target
    const activeKey =
      activeTargetId >= 0
        ? targetMapRef.current.get(activeTargetId) ?? fallbackKey ?? null
        : null;
    const normalizedActiveKey = activeKey === 'SUBMIT_PURSUIT' ? 'SUBMIT' : activeKey;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const { row, col } = getGridCell(cursorX, cursorY, w, h);
    const gridRegion = getActionFromGrid(row, col) as RegionId;
    const mappedRegion: RegionId =
      targetMapRef.current.size > 0
        ? (normalizedActiveKey as RegionId | null) ?? 'DEADZONE'
        : (normalizedActiveKey as RegionId | null) ?? gridRegion;

    const newRegion: RegionId =
      interactionModeRef.current === 'confirm'
        ? mappedRegion === 'SAFE_MARGIN' ||
          mappedRegion === 'NEXT' ||
          mappedRegion === 'SUBMIT' ||
          mappedRegion === 'DEADZONE'
          ? mappedRegion
          : 'DEADZONE'
        : mappedRegion;

    const profileDwellMs = accessibilityProfileRef.current.dwellTimeMs;
    let currentDwellRequirement =
      typeof profileDwellMs === 'number' && profileDwellMs > 0
        ? profileDwellMs
        : DEFAULT_DWELL_REQUIREMENT_MS;
    if (newRegion === 'SUBMIT') currentDwellRequirement = SUBMIT_DWELL_REQUIREMENT_MS;

    const isSafeZone =
      interactionModeRef.current === 'confirm'
        ? newRegion === 'DEADZONE'
        : newRegion === 'DEADZONE' || newRegion === 'SAFE_MARGIN';

    if (now < dwellCooldownUntilRef.current) {
      regionRef.current = newRegion;
      dwellStartRef.current = null;
      currentDwellProgressRef.current = 0;
    } else if (newRegion !== regionRef.current) {
      regionRef.current = newRegion;
      dwellStartRef.current = isSafeZone ? null : now;
      currentDwellProgressRef.current = 0;
    } else if (!isSafeZone) {
      if (!dwellStartRef.current) {
        dwellStartRef.current = now;
      }
      const elapsedDwell = now - dwellStartRef.current;
      currentDwellProgressRef.current = Math.min(elapsedDwell / currentDwellRequirement, 1.0);
      if (currentDwellProgressRef.current >= 1.0) {
        if (now - lastDwellClickAtRef.current >= DWELL_CLICK_COOLDOWN_MS) {
          const [clickX, clickY] = resolveTargetClickPoint(
            cursorX,
            cursorY,
            activeTargetId,
            registeredTargetsRef.current
          );
          dispatchMouseEvent('click', clickX, clickY);
          if (mouseControllerRef.current) {
            mouseControllerRef.current.flashClickEffect();
          }
          lastDwellClickAtRef.current = now;
        }
        dwellStartRef.current = null;
        currentDwellProgressRef.current = 0;
        dwellCooldownUntilRef.current = now + 1400;
      }
    }

    // FPS calculation
    framesRef.current++;
    const elapsedFps = now - lastFpsTimeRef.current;
    if (elapsedFps >= 1000) {
      fpsRef.current = Math.round((framesRef.current * 1000) / elapsedFps);
      framesRef.current = 0;
      lastFpsTimeRef.current = now;
    }

    // Throttle publish stats to React state
    if (now - lastStatsPublishRef.current >= STATS_PUBLISH_INTERVAL_MS) {
      const unified = latestUnifiedResultRef.current;

      setStats({
        fps: fpsRef.current,
        mediapipeMs: unified?.mediapipeMs ?? 0,
        inferenceMs: unified?.inferenceMs ?? 0,
        activeModel: activeModelRef.current,
        rawGaze: unified?.rawGaze ?? targetGazeRef.current,
        smoothedGaze: [cursorX, cursorY],
        snappedGaze: snapped ? [cursorX, cursorY] : undefined,
        activeTargetKey: activeKey,
        earLeft: unified?.features?.earLeft ?? 0,
        earRight: unified?.features?.earRight ?? 0,
        blinkState: unified?.blinkEvent ?? 'none',
        saccadeEvent: unified?.saccadeEvent ?? 'none',
        pursuitProgress: unified?.pursuitProgress ?? 0,
        pursuitConfirmed: unified?.pursuitConfirmed ?? false,
        headPoseOk: unified?.features?.headPoseOk ?? true,
        lightingScore: unified?.features?.lightingScore ?? 1.0,
        iod: unified?.features?.iod ?? 0.12,
        dragEnabled: isDraggingRef.current,
        faceCount: unified?.faceCount ?? 0,
        singleFaceReady: unified?.singleFaceReady ?? false,
        eyeOverlay: unified?.eyeOverlay ?? null,
        currentRegion: regionRef.current,
        dwellProgress: currentDwellProgressRef.current,
      });
      lastStatsPublishRef.current = now;
    }

    renderRafRef.current = requestAnimationFrame(runRenderCursorLoop);
  }, [dispatchMouseEvent]);

  const ensureRenderLoopRunning = useCallback(() => {
    if (renderRafRef.current) return;
    const w = typeof window !== 'undefined' ? window.innerWidth : 0;
    const h = typeof window !== 'undefined' ? window.innerHeight : 0;
    if (
      !isPipelineActiveRef.current &&
      targetGazeRef.current[0] === 0 &&
      targetGazeRef.current[1] === 0 &&
      w > 0 &&
      h > 0
    ) {
      targetGazeRef.current = [w / 2, h / 2];
      springRef.current.reset(w / 2, h / 2);
    }
    lastRenderTimeRef.current = performance.now();
    renderRafRef.current = requestAnimationFrame(runRenderCursorLoop);
  }, [runRenderCursorLoop]);

  const registerMagneticTargets = useCallback(
    (targets: MagneticTargetSpec[]) => {
      registeredTargetsRef.current = [...targets];
      const map = new Map<number, string>();
      for (const t of targets) {
        map.set(t.id, t.key);
      }
      targetMapRef.current = map;
      if (workerRef.current) {
        void workerRef.current.setMagneticTargets(targets);
      }
      if (targets.length > 0) {
        ensureRenderLoopRunning();
      }
    },
    [ensureRenderLoopRunning]
  );

  const clearMagneticTargets = useCallback(() => {
    registeredTargetsRef.current = [];
    targetMapRef.current.clear();
    if (workerRef.current) {
      void workerRef.current.clearMagneticTargets();
    }
    if (!isPipelineActiveRef.current && renderRafRef.current) {
      cancelAnimationFrame(renderRafRef.current);
      renderRafRef.current = 0;
      mouseControllerRef.current?.hide();
      regionRef.current = 'DEADZONE';
      dwellStartRef.current = null;
      currentDwellProgressRef.current = 0;
      activeTargetIdRef.current = -1;
      isSnappedRef.current = false;
    }
  }, []);

  const stopPipeline = useCallback(() => {
    isPipelineActiveRef.current = false;
    latestUnifiedResultRef.current = null;
    if (inferenceRafRef.current) {
      cancelAnimationFrame(inferenceRafRef.current);
      inferenceRafRef.current = 0;
    }
    if (renderRafRef.current) {
      cancelAnimationFrame(renderRafRef.current);
      renderRafRef.current = 0;
    }
    mouseControllerRef.current?.hide();
    regionRef.current = 'DEADZONE';
    dwellStartRef.current = null;
    currentDwellProgressRef.current = 0;
    dwellCooldownUntilRef.current = 0;
    activeTargetIdRef.current = -1;
    isSnappedRef.current = false;
    if (mountedRef.current) {
      setIsPipelineActive(false);
    }
  }, []);

  const startPipeline = useCallback((videoElement: HTMLVideoElement) => {
    videoRef.current = videoElement;
    stopPipeline();
    isPipelineActiveRef.current = true;
    if (mountedRef.current) {
      setIsPipelineActive(true);
    }
    void ensureEngineInitialized();

    const w = window.innerWidth;
    const h = window.innerHeight;
    targetGazeRef.current = [w / 2, h / 2];
    springRef.current.reset(w / 2, h / 2);

    lastInferenceTimeRef.current = performance.now();
    lastRenderTimeRef.current = performance.now();
    lastStatsPublishRef.current = 0;
    lastDwellClickAtRef.current = 0;
    dwellCooldownUntilRef.current = 0;

    inferenceRafRef.current = requestAnimationFrame(runInferenceLoop);
    renderRafRef.current = requestAnimationFrame(runRenderCursorLoop);
  }, [ensureEngineInitialized, runInferenceLoop, runRenderCursorLoop, stopPipeline]);

  useEffect(() => {
    mountedRef.current = true;
    sharedBufferRef.current = new SharedGazeBuffer();

    const worker = new Worker(new URL('../../workers/gaze.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = Comlink.wrap<GazeWorker>(worker);

    mouseControllerRef.current = new WebCursorController();

    const handlePointerFallback = (e: PointerEvent | MouseEvent) => {
      if (
        registeredTargetsRef.current.length > 0 &&
        !latestUnifiedResultRef.current?.singleFaceReady
      ) {
        targetGazeRef.current = [e.clientX, e.clientY];
        activeTargetIdRef.current = -1;
        isSnappedRef.current = false;
      }
    };

    window.addEventListener('pointermove', handlePointerFallback, { passive: true });
    window.addEventListener('mousemove', handlePointerFallback, { passive: true });

    const initTimer = window.setTimeout(() => {
      void ensureEngineInitialized();
    }, PIPELINE_INIT_DELAY_MS);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(initTimer);
      window.removeEventListener('pointermove', handlePointerFallback);
      window.removeEventListener('mousemove', handlePointerFallback);
      stopPipeline();
      engineReadyRef.current = false;
      setIsEngineReady(false);
      setIsInitializing(false);

      if (workerRef.current) {
        void workerRef.current.shutdown();
      }
      workerRef.current = null;
      worker.terminate();

      if (mouseControllerRef.current) {
        mouseControllerRef.current.destroy();
      }
      mouseControllerRef.current = null;
    };
  }, [ensureEngineInitialized, stopPipeline]);

  const setModel = useCallback(
    async (
      modelType: 'polynomial' | 'mlp' | 'none',
      weights?: PolynomialWeights | MLPWeights
    ) => {
      activeModelRef.current = modelType === 'mlp' ? 'polynomial' : modelType;
      if (!workerRef.current) return;

      await ensureEngineInitialized();

      if (modelType === 'none') {
        await workerRef.current.clearPolynomialWeights();
        return;
      }

      if (weights && 'coeffsX' in weights && weights.coeffsX && weights.coeffsY) {
        await workerRef.current.setPolynomialWeights(weights.coeffsX, weights.coeffsY);
      }
    },
    [ensureEngineInitialized]
  );

  const setInteractionMode = useCallback((mode: 'default' | 'confirm') => {
    if (interactionModeRef.current === mode) return;
    interactionModeRef.current = mode;
    regionRef.current = 'DEADZONE';
    dwellStartRef.current = null;
    currentDwellProgressRef.current = 0;
  }, []);

  const getLatestFeatures = useCallback(() => latestFeaturesRef.current, []);

  const contextValue = useMemo<GazeContextType>(
    () => ({
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
      registerMagneticTargets,
      clearMagneticTargets,
      recordImplicitDrift,
      setPursuitOrbitTarget,
      resetDwell,
      accessibilityProfile,
      setAccessibilityProfile,
    }),
    [
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
      registerMagneticTargets,
      clearMagneticTargets,
      recordImplicitDrift,
      setPursuitOrbitTarget,
      resetDwell,
      accessibilityProfile,
      setAccessibilityProfile,
    ]
  );

  return (
    <GazeContext.Provider value={contextValue}>
      {children}
      {isInitializing && isPipelineActive && (
        <div className="pointer-events-none fixed top-3 right-3 z-[99998] rounded-lg border border-[#D4D4D8] bg-white px-3.5 py-2 text-xs font-medium text-[#0A0A0A]">
          Đang khởi động hệ thống nhận diện gaze...
        </div>
      )}
      {initializationError && (
        <div className="pointer-events-none fixed top-3 left-1/2 -translate-x-1/2 z-[99998] rounded-lg border border-[#DC2626] bg-[#FEF2F2] px-3.5 py-2 text-xs font-medium text-[#7F1D1D]">
          Lỗi khởi tạo gaze: {initializationError}
        </div>
      )}
    </GazeContext.Provider>
  );
}
