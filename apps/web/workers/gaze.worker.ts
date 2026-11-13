import { expose } from 'comlink';
import { extractFeatures } from '../lib/gaze/feature-extractor';
import { createFaceLandmarker } from '../lib/gaze/mediapipe';
import { PolynomialGazeMapper } from '../lib/gaze/polynomial';
import { loadGazeCoreWasm, WasmGazeEngine } from '../lib/wasm-pkg';
import {
  AccessibilityProfileConfig,
  DEFAULT_ACCESSIBILITY_PROFILE,
  MagneticTargetSpec,
  SharedGazeBuffer,
} from '../lib/gaze-bridge/engine';
import type { GazeFeatures } from '../lib/gaze/types';
import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

type Point2D = [number, number];

export interface EyeOverlay {
  leftEye: Point2D[];
  rightEye: Point2D[];
  leftIris: Point2D[];
  rightIris: Point2D[];
}

export interface WorkerFrameResult {
  faceCount: number;
  singleFaceReady: boolean;
  features: GazeFeatures | null;
  eyeOverlay: EyeOverlay | null;
  mediapipeMs: number;
}

export interface UnifiedFrameResult {
  rawGaze: [number, number];
  snappedGaze: [number, number];
  activeTargetId: number;
  blinkEvent: 'none' | 'left_click' | 'right_click' | 'drag_toggle';
  saccadeEvent: 'none' | 'next' | 'prev';
  pursuitProgress: number;
  pursuitConfirmed: boolean;
  features: GazeFeatures | null;
  eyeOverlay: EyeOverlay | null;
  faceCount: number;
  singleFaceReady: boolean;
  mediapipeMs: number;
  inferenceMs: number;
  isValid: boolean;
}

const LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] as const;
const RIGHT_EYE_CONTOUR = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466] as const;
const LEFT_IRIS = [468, 469, 470, 471, 472] as const;
const RIGHT_IRIS = [473, 474, 475, 476, 477] as const;

let faceLandmarker: FaceLandmarker | null = null;
let faceLandmarkerInitPromise: Promise<void> | null = null;
let wasmEngine: WasmGazeEngine | null = null;
let wasmInitPromise: Promise<void> | null = null;
let sharedBufferBridge: SharedGazeBuffer | null = null;

const jsPolyMapper = new PolynomialGazeMapper();
let currentPolyWeights: { coeffsX: number[]; coeffsY: number[] } | null = null;
let cachedMagneticTargets: MagneticTargetSpec[] = [];
let activeAccessibilityConfig: AccessibilityProfileConfig = { ...DEFAULT_ACCESSIBILITY_PROFILE };

function applyMagneticTargets(engine: WasmGazeEngine, targets: MagneticTargetSpec[]): void {
  engine.clearTargets();
  for (const t of targets) {
    engine.addTarget(
      t.id,
      t.x,
      t.y,
      t.width,
      t.height,
      (t.gravityRadius ?? 60.0) * activeAccessibilityConfig.magneticStrength
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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

async function ensureWasmReady(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      try {
        const exports = await loadGazeCoreWasm('/wasm/gaze_core.wasm');
        wasmEngine = new WasmGazeEngine(exports, 1920, 1080);
        if (currentPolyWeights) {
          wasmEngine.importWeights(currentPolyWeights.coeffsX, currentPolyWeights.coeffsY);
        }
        if (cachedMagneticTargets.length > 0) {
          applyMagneticTargets(wasmEngine, cachedMagneticTargets);
        }
      } catch (err) {
        console.warn('WasmGazeEngine initialization failed, falling back to TypeScript math', err);
      }
    })();
  }
  return wasmInitPromise;
}

async function ensureFaceLandmarkerReady(): Promise<void> {
  if (!faceLandmarkerInitPromise) {
    faceLandmarkerInitPromise = (async () => {
      faceLandmarker = await createFaceLandmarker();
    })();
  }
  return faceLandmarkerInitPromise;
}

function fillInputLandmarkBuffer(
  lm: NormalizedLandmark[],
  features: GazeFeatures
): Float64Array {
  const buf = new Float64Array(33);
  // [0..8]: 4 canthus landmarks (left_inner x,y, left_outer x,y, right_inner x,y, right_outer x,y)
  buf[0] = lm[133].x;
  buf[1] = lm[133].y;
  buf[2] = lm[33].x;
  buf[3] = lm[33].y;
  buf[4] = lm[362].x;
  buf[5] = lm[362].y;
  buf[6] = lm[263].x;
  buf[7] = lm[263].y;

  // [8..18]: 5 left iris landmarks (x,y)
  for (let i = 0; i < 5; i++) {
    buf[8 + i * 2] = lm[468 + i].x;
    buf[9 + i * 2] = lm[468 + i].y;
  }

  // [18..28]: 5 right iris landmarks (x,y)
  for (let i = 0; i < 5; i++) {
    buf[18 + i * 2] = lm[473 + i].x;
    buf[19 + i * 2] = lm[473 + i].y;
  }

  // [28..33]: ear_left, ear_right, pitch, yaw, roll
  buf[28] = features.earLeft;
  buf[29] = features.earRight;
  buf[30] = features.headPitch;
  buf[31] = features.headYaw;
  buf[32] = features.headRoll;

  return buf;
}

const gazeWorker = {
  async initialize() {
    await Promise.all([ensureFaceLandmarkerReady(), ensureWasmReady()]);
  },

  async initTF() {
    // No-op for backward compatibility
  },

  initSharedBuffer(buffer: SharedArrayBuffer | ArrayBuffer) {
    sharedBufferBridge = new SharedGazeBuffer(buffer);
  },

  setAccessibilityConfig(config: Partial<AccessibilityProfileConfig>) {
    activeAccessibilityConfig = { ...activeAccessibilityConfig, ...config };
    if (wasmEngine) {
      const dominantEyeCode =
        activeAccessibilityConfig.dominantEye === 'left'
          ? 1
          : activeAccessibilityConfig.dominantEye === 'right'
          ? 2
          : 0;
      wasmEngine.setEarBaseline(0.28, dominantEyeCode);
    }
  },

  async setPolynomialWeights(coeffsX: number[], coeffsY: number[]) {
    currentPolyWeights = { coeffsX: [...coeffsX], coeffsY: [...coeffsY] };
    jsPolyMapper.load(currentPolyWeights);
    if (wasmEngine) {
      wasmEngine.importWeights(coeffsX, coeffsY);
    }
  },

  clearPolynomialWeights() {
    currentPolyWeights = null;
    jsPolyMapper.isCalibrated = false;
    if (wasmEngine) {
      wasmEngine.clearCalibration();
    }
  },

  setMagneticTargets(targets: MagneticTargetSpec[]) {
    cachedMagneticTargets = [...targets];
    if (wasmEngine) {
      applyMagneticTargets(wasmEngine, cachedMagneticTargets);
    }
  },

  clearMagneticTargets() {
    cachedMagneticTargets = [];
    if (wasmEngine) {
      wasmEngine.clearTargets();
    }
  },

  addDriftSample(predX: number, predY: number, targetX: number, targetY: number, weight = 1.0) {
    if (wasmEngine) {
      wasmEngine.addDriftSample(predX, predY, targetX, targetY, weight);
    }
  },

  setPursuitTarget(cx: number, cy: number, radius = 40.0, periodMs = 1200.0) {
    if (wasmEngine) {
      wasmEngine.setPursuitTarget(cx, cy, radius, periodMs);
    }
  },

  async detectFrame(frame: ImageBitmap, timestampMs: number, includeOverlay = true): Promise<WorkerFrameResult> {
    await ensureFaceLandmarkerReady();

    const landmarker = faceLandmarker;
    if (!landmarker) {
      frame.close();
      throw new Error('FaceLandmarker is not initialized');
    }

    const t0 = performance.now();
    try {
      const result = landmarker.detectForVideo(frame as unknown as HTMLVideoElement, timestampMs);
      const mediapipeMs = performance.now() - t0;
      const faceCount = result.faceLandmarks?.length ?? 0;
      const singleFaceReady = faceCount === 1;

      return {
        faceCount,
        singleFaceReady,
        features: singleFaceReady ? extractFeatures(result) : null,
        eyeOverlay: includeOverlay && singleFaceReady ? buildEyeOverlay(result.faceLandmarks?.[0]) : null,
        mediapipeMs,
      };
    } finally {
      frame.close();
    }
  },

  async inferGaze(
    features: GazeFeatures,
    screenWidth: number,
    screenHeight: number,
    activeModel: 'polynomial' | 'mlp' | 'none',
    irisAmplification: number
  ): Promise<{ rawGaze: [number, number]; inferenceMs: number; activeModel: 'polynomial' | 'mlp' | 'none' }> {
    const t0 = performance.now();
    let resolvedModel: 'polynomial' | 'mlp' | 'none' = activeModel;
    let rawGaze: [number, number];

    if (currentPolyWeights && (activeModel === 'polynomial' || activeModel === 'mlp')) {
      resolvedModel = 'polynomial';
      rawGaze = gazeWorker.runPolynomialSync(features);
    } else {
      resolvedModel = 'none';
      const irisX = (features.irisXLeft + features.irisXRight) / 2;
      const irisY = (features.irisYLeft + features.irisYRight) / 2;
      const amplifiedX = (irisX - 0.5) * irisAmplification + 0.5;
      const amplifiedY = (irisY - 0.5) * irisAmplification + 0.5;
      rawGaze = [
        clamp(amplifiedX * screenWidth, 0, screenWidth),
        clamp(amplifiedY * screenHeight, 0, screenHeight),
      ];
    }

    return {
      rawGaze,
      inferenceMs: performance.now() - t0,
      activeModel: resolvedModel,
    };
  },

  runPolynomialSync(features: GazeFeatures): [number, number] {
    if (features.feature18) {
      return jsPolyMapper.predict(features.feature18);
    }
    return jsPolyMapper.predict([
      features.irisXLeft,
      features.irisYLeft,
      features.irisXRight,
      features.irisYRight,
      features.headPitch,
      features.headYaw,
      features.headRoll,
    ]);
  },

  async runPolynomial(features: GazeFeatures, coeffsX?: number[], coeffsY?: number[]): Promise<[number, number]> {
    if (coeffsX && coeffsY) {
      jsPolyMapper.coeffsX = coeffsX;
      jsPolyMapper.coeffsY = coeffsY;
      jsPolyMapper.isCalibrated = true;
    }
    return gazeWorker.runPolynomialSync(features);
  },

  async loadMLPModel() {
    // Graceful no-op: TensorFlow.js is completely replaced by 18D Huber Ridge WASM Core
  },

  async runMLP(features: GazeFeatures): Promise<[number, number]> {
    return gazeWorker.runPolynomialSync(features);
  },

  /**
   * Unified single-pass frame execution:
   * MediaPipe FaceLandmarks -> WASM Gaze Core -> Zero-copy SharedBuffer -> Unified result.
   */
  async processFrameUnified(
    frame: ImageBitmap,
    timestampMs: number,
    dtSec: number,
    screenWidth: number,
    screenHeight: number,
    includeOverlay = true
  ): Promise<UnifiedFrameResult> {
    await Promise.all([ensureFaceLandmarkerReady(), ensureWasmReady()]);

    const landmarker = faceLandmarker;
    if (!landmarker) {
      frame.close();
      throw new Error('FaceLandmarker is not initialized');
    }

    const tStart = performance.now();
    let mediapipeMs = 0;
    let inferenceMs = 0;

    let faceCount = 0;
    let singleFaceReady = false;
    let features: GazeFeatures | null = null;
    let eyeOverlay: EyeOverlay | null = null;

    let rawGaze: [number, number] = [screenWidth / 2, screenHeight / 2];
    let snappedGaze: [number, number] = [screenWidth / 2, screenHeight / 2];
    let activeTargetId = -1;
    let blinkEvent: 'none' | 'left_click' | 'right_click' | 'drag_toggle' = 'none';
    let saccadeEvent: 'none' | 'next' | 'prev' = 'none';
    let pursuitProgress = 0;
    let pursuitConfirmed = false;
    let isValid = false;

    try {
      const detectionResult = landmarker.detectForVideo(
        frame as unknown as HTMLVideoElement,
        timestampMs
      );
      mediapipeMs = performance.now() - tStart;

      faceCount = detectionResult.faceLandmarks?.length ?? 0;
      singleFaceReady = faceCount === 1;

      if (singleFaceReady) {
        const firstFace = detectionResult.faceLandmarks[0];
        features = extractFeatures(detectionResult);
        if (includeOverlay) {
          eyeOverlay = buildEyeOverlay(firstFace);
        }

        const tInferStart = performance.now();

        if (wasmEngine && features) {
          wasmEngine.setScreenSize(screenWidth, screenHeight);
          const inputBuf = fillInputLandmarkBuffer(firstFace, features);
          wasmEngine.setInputLandmarks(inputBuf);

          const wasmOut = wasmEngine.processFrame(timestampMs, dtSec);
          inferenceMs = performance.now() - tInferStart;

          rawGaze = [wasmOut.rawX, wasmOut.rawY];
          snappedGaze = [wasmOut.snappedX, wasmOut.snappedY];
          activeTargetId = wasmOut.activeTargetId;
          pursuitProgress = wasmOut.pursuitProgress;
          pursuitConfirmed = wasmOut.pursuitProgress >= 1.0;
          isValid = wasmOut.isValid;

          if (wasmOut.blinkEventCode === 1) {
            blinkEvent = 'left_click';
          } else if (wasmOut.blinkEventCode === 2) {
            blinkEvent = 'right_click';
          }

          if (wasmOut.saccadeEventCode === 1) {
            saccadeEvent = 'next';
          } else if (wasmOut.saccadeEventCode === 2) {
            saccadeEvent = 'prev';
          }

          if (sharedBufferBridge) {
            sharedBufferBridge.writeSnapshot(wasmOut);
          }
        } else if (features) {
          // Fallback JavaScript path
          const fallbackGaze = gazeWorker.runPolynomialSync(features);
          rawGaze = fallbackGaze;
          snappedGaze = fallbackGaze;
          isValid = true;
          inferenceMs = performance.now() - tInferStart;

          if (sharedBufferBridge) {
            sharedBufferBridge.writeSnapshot({
              rawX: rawGaze[0],
              rawY: rawGaze[1],
              driftX: rawGaze[0],
              driftY: rawGaze[1],
              filteredX: rawGaze[0],
              filteredY: rawGaze[1],
              smoothX: rawGaze[0],
              smoothY: rawGaze[1],
              snappedX: snappedGaze[0],
              snappedY: snappedGaze[1],
              activeTargetId: -1,
              blinkEventCode: 0,
              blinkDurationMs: 0,
              saccadeEventCode: 0,
              pursuitProgress: 0,
              isValid: true,
            });
          }
        }
      }
    } finally {
      frame.close();
    }

    return {
      rawGaze,
      snappedGaze,
      activeTargetId,
      blinkEvent,
      saccadeEvent,
      pursuitProgress,
      pursuitConfirmed,
      features,
      eyeOverlay,
      faceCount,
      singleFaceReady,
      mediapipeMs,
      inferenceMs,
      isValid,
    };
  },

  shutdown() {
    if (faceLandmarker) {
      faceLandmarker.close();
      faceLandmarker = null;
    }
    if (wasmEngine) {
      wasmEngine.destroy();
      wasmEngine = null;
    }
    faceLandmarkerInitPromise = null;
    wasmInitPromise = null;
    currentPolyWeights = null;
    cachedMagneticTargets = [];
    sharedBufferBridge = null;
  },
};

export type GazeWorker = typeof gazeWorker;
expose(gazeWorker);
