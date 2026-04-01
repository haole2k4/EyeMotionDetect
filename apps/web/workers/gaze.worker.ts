import { expose } from 'comlink';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tf: typeof import('@tensorflow/tfjs') | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mlpModelInstance: any = null;

const gazeWorker = {
  async initTF() {
    if (!tf) {
      tf = await import('@tensorflow/tfjs');
      // Cố gắng sử dụng WebGPU nếu có thể
      try {
        await import('@tensorflow/tfjs-backend-webgpu');
        await tf.setBackend('webgpu');
        await tf.ready();
      } catch (e) {
        console.warn('WebGPU not supported in worker, fallback to WASM/WebGL/CPU', e);
      }
    }
  },

  async runPolynomial(features: number[], coeffsX: number[], coeffsY: number[]): Promise<[number, number]> {
    // Tự tính polynomial prediction
    const [x1, y1, x2, y2, p, y, r] = features;
    const expanded = [
      1, x1, y1, x2, y2, p, y, r,
      x1*x1, y1*y1, x2*x2, y2*y2,
      p*p, y*y,
      x1*y1, x2*y2,
      x1*y, x2*y,
      y1*p, y2*p,
    ];

    const dot = (a: number[], b: number[]) => a.reduce((sum, val, i) => sum + val * b[i], 0);
    return [dot(coeffsX, expanded), dot(coeffsY, expanded)];
  },

  async loadMLPModel(json: string, weights: ArrayBuffer) {
    if (!tf) await this.initTF();

    const parsed = JSON.parse(json);
    // Re-create the layers model
    mlpModelInstance = await tf!.loadLayersModel(tf!.io.fromMemory({
      modelTopology: parsed.modelTopology,
      weightSpecs: parsed.weightSpecs,
      weightData: weights
    }));
  },

  async runMLP(features: number[], screenWidth: number, screenHeight: number): Promise<[number, number]> {
    if (!tf || !mlpModelInstance) {
      throw new Error('MLP Model not loaded in worker');
    }

    const input = tf.tensor2d([features]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = mlpModelInstance.predict(input) as any;
    const [normX, normY] = Array.from(output.dataSync()) as [number, number];
    
    input.dispose();
    output.dispose();

    return [normX * screenWidth, normY * screenHeight];
  }
};

export type GazeWorker = typeof gazeWorker;
expose(gazeWorker);
