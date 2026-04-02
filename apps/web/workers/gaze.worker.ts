import { expose } from 'comlink';
import type { GazeFeatures } from '../lib/gaze/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tf: typeof import('@tensorflow/tfjs') | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mlpModelInstance: any = null;
let tfInitPromise: Promise<void> | null = null;

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

const gazeWorker = {
  async initTF() {
    await ensureTFReady();
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
  }
};

export type GazeWorker = typeof gazeWorker;
expose(gazeWorker);
