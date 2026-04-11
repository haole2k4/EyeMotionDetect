import { expose } from 'comlink';
import { extractFeatures } from '../lib/gaze/feature-extractor';
import { createFaceLandmarker } from '../lib/gaze/mediapipe';
import type { GazeFeatures } from '../lib/gaze/types';
import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

type Point2D = [number, number];

interface EyeOverlay {
  leftEye: Point2D[];
  rightEye: Point2D[];
  leftIris: Point2D[];
  rightIris: Point2D[];
}

interface WorkerFrameResult {
  faceCount: number;
  singleFaceReady: boolean;
  features: GazeFeatures | null;
  eyeOverlay: EyeOverlay | null;
  mediapipeMs: number;
}

const LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] as const;
const RIGHT_EYE_CONTOUR = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466] as const;
const LEFT_IRIS = [468, 469, 470, 471, 472] as const;
const RIGHT_IRIS = [473, 474, 475, 476, 477] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tf: typeof import('@tensorflow/tfjs') | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mlpModelInstance: any = null;
let tfInitPromise: Promise<void> | null = null;
let faceLandmarker: FaceLandmarker | null = null;
let faceLandmarkerInitPromise: Promise<void> | null = null;
let polyWeights: { x: number[]; y: number[] } | null = null;

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

async function ensureTFReady(): Promise<void> {
  if (!tfInitPromise) {
    tfInitPromise = (async () => {
      tf = await import('@tensorflow/tfjs');

      try {
        await import('@tensorflow/tfjs-backend-webgpu');
        await tf.setBackend('webgpu');
      } catch (e) {
        console.warn('WebGPU not supported in worker, fallback to WASM/CPU', e);
        try {
          await import('@tensorflow/tfjs-backend-wasm');
          await tf.setBackend('wasm');
        } catch {
          await tf.setBackend('cpu');
        }
      }

      await tf.ready();
    })();
  }

  try {
    await tfInitPromise;
  } catch (e) {
    tfInitPromise = null;
    throw e;
  }
}

async function ensureFaceLandmarkerReady(): Promise<void> {
  if (!faceLandmarkerInitPromise) {
    faceLandmarkerInitPromise = (async () => {
      faceLandmarker = await createFaceLandmarker();
    })();
  }

  try {
    await faceLandmarkerInitPromise;
  } catch (e) {
    faceLandmarkerInitPromise = null;
    throw e;
  }
}

const gazeWorker = {
  async initialize() {
    await ensureTFReady();
    await ensureFaceLandmarkerReady();
  },

  async initTF() {
    await ensureTFReady();
  },

  async setPolynomialWeights(coeffsX: number[], coeffsY: number[]) {
    polyWeights = { x: coeffsX, y: coeffsY };
  },

  clearPolynomialWeights() {
    polyWeights = null;
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
    irisAmplification: number,
  ): Promise<{ rawGaze: [number, number]; inferenceMs: number; activeModel: 'polynomial' | 'mlp' | 'none' }> {
    const t0 = performance.now();
    let resolvedModel: 'polynomial' | 'mlp' | 'none' = activeModel;
    let rawGaze: [number, number];

    if (activeModel === 'mlp' && mlpModelInstance) {
      rawGaze = await gazeWorker.runMLP(features, screenWidth, screenHeight);
    } else if (activeModel === 'polynomial' && polyWeights) {
      rawGaze = await gazeWorker.runPolynomial(features, polyWeights.x, polyWeights.y);
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

  async runPolynomial(features: GazeFeatures, coeffsX: number[], coeffsY: number[]): Promise<[number, number]> {
    const { irisXLeft, irisYLeft, irisXRight, irisYRight, headPitch, headYaw, headRoll } = features;
    const expanded = [
      1, 
      irisXLeft, irisYLeft, irisXRight, irisYRight, headPitch, headYaw, headRoll,
      irisXLeft * irisXLeft, irisYLeft * irisYLeft, irisXRight * irisXRight, irisYRight * irisYRight,
      headPitch * headPitch, headYaw * headYaw,
      irisXLeft * irisYLeft, irisXRight * irisYRight,
      irisXLeft * headYaw, irisXRight * headYaw,
      irisYLeft * headPitch, irisYRight * headPitch,
    ];

    const dot = (a: number[], b: number[]) => a.reduce((sum, val, i) => sum + val * b[i], 0);
    return [dot(coeffsX, expanded), dot(coeffsY, expanded)];
  },

  async loadMLPModel(json: string, weights: ArrayBuffer) {
    await ensureTFReady();
    const tfRef = tf;
    if (!tfRef) {
      throw new Error('TensorFlow backend not initialized');
    }

    const parsed = JSON.parse(json);
    mlpModelInstance = await tfRef.loadLayersModel(tfRef.io.fromMemory({
      modelTopology: parsed.modelTopology,
      weightSpecs: parsed.weightSpecs,
      weightData: weights
    }));
  },

  async runMLP(features: GazeFeatures, screenWidth: number, screenHeight: number): Promise<[number, number]> {
    await ensureTFReady();
    const tfRef = tf;
    if (!tfRef) {
      throw new Error('TensorFlow backend not initialized');
    }

    if (!mlpModelInstance) {
      throw new Error('MLP Model not loaded in worker');
    }

    const { irisXLeft, irisYLeft, irisXRight, irisYRight, headPitch, headYaw, headRoll } = features;
    const inputFeatures = [irisXLeft, irisYLeft, irisXRight, irisYRight, headPitch, headYaw, headRoll];

    const input = tfRef.tensor2d([inputFeatures]);
    const output = mlpModelInstance.predict(input) as any;
    const [normX, normY] = Array.from(output.dataSync()) as [number, number];
    
    input.dispose();
    output.dispose();

    return [normX * screenWidth, normY * screenHeight];
  },

  shutdown() {
    if (faceLandmarker) {
      faceLandmarker.close();
      faceLandmarker = null;
    }
    faceLandmarkerInitPromise = null;
    mlpModelInstance = null;
    polyWeights = null;
  },
};

export type GazeWorker = typeof gazeWorker;
expose(gazeWorker);
