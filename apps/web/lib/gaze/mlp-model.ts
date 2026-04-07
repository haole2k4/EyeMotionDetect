import * as tf from '@tensorflow/tfjs';
import type { CalibrationSample } from './types';

export class GazeMLPModel {
  private model: tf.LayersModel | null = null;
  private static backendInitPromise: Promise<void> | null = null;

  static async ensureBackendReady(): Promise<void> {
    if (!GazeMLPModel.backendInitPromise) {
      GazeMLPModel.backendInitPromise = (async () => {
        try {
          await import('@tensorflow/tfjs-backend-webgpu');
          await tf.setBackend('webgpu');
        } catch (e) {
          console.warn('WebGPU not available in main thread, fallback to WASM/CPU', e);
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
      await GazeMLPModel.backendInitPromise;
    } catch (e) {
      GazeMLPModel.backendInitPromise = null;
      throw e;
    }
  }

  build(): void {
    this.model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [7], // iris * 4 + head pose * 3
          units: 32,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
          name: 'hidden1'
        }),
        tf.layers.dropout({ rate: 0.1 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu',
          name: 'hidden2'
        }),
        tf.layers.dense({
          units: 2,
          activation: 'linear',
          name: 'output'
        }),
      ]
    });

    this.model.compile({
      optimizer: tf.train.adam(0.005),
      loss: 'meanSquaredError',
      metrics: ['mae'],
    });
  }

  async train(
    samples: CalibrationSample[],
    screenWidth: number,
    screenHeight: number,
    onProgress?: (epoch: number, mae: number) => void
  ): Promise<{ finalMae: number; epochs: number }> {
    await GazeMLPModel.ensureBackendReady();

    if (!this.model) {
      throw new Error('Model not built yet');
    }

    const xs = tf.tensor2d(samples.map(s => s.features));
    const ys = tf.tensor2d(samples.map((s) => {
      const width = s.viewportWidth && s.viewportWidth > 0 ? s.viewportWidth : screenWidth;
      const height = s.viewportHeight && s.viewportHeight > 0 ? s.viewportHeight : screenHeight;
      return [
        s.screenX / width,
        s.screenY / height
      ];
    }));

    let finalMae = Infinity;
    let epochCount = 0;

    await this.model.fit(xs, ys, {
      epochs: 150,
      batchSize: Math.min(32, Math.max(1, Math.floor(samples.length / 2))),
      validationSplit: 0.15,
      shuffle: true,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          epochCount = epoch + 1;
          finalMae = (logs?.val_mae ?? logs?.mae ?? 0)
            * Math.max(screenWidth, screenHeight); // tính theo pixels

          if (onProgress) {
            onProgress(epoch, finalMae);
          }

          // Early stopping thủ công
          if (finalMae < 40 && this.model) {
            await tf.nextFrame();
            this.model.stopTraining = true;
          }
        }
      }
    });

    xs.dispose();
    ys.dispose();

    return { finalMae, epochs: epochCount };
  }

  predict(features: number[], screenWidth: number, screenHeight: number): [number, number] {
    if (!this.model) {
      throw new Error('Model not built or loaded');
    }

    const input = tf.tensor2d([features]);
    const output = this.model.predict(input) as tf.Tensor;
    const [normX, normY] = Array.from(output.dataSync()) as [number, number];

    input.dispose();
    output.dispose();

    const clampVal = (val: number, limit: number) => {
      const res = Math.max(0, Math.min(1, val));
      return limit * res;
    };

    return [clampVal(normX, screenWidth), clampVal(normY, screenHeight)];
  }

  // Serialize để lưu lên PostgreSQL
  async serialize(): Promise<{ json: string; weights: ArrayBuffer }> {
    if (!this.model) {
      throw new Error('Model not built yet');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let savedArtifacts: any = null;
    await this.model.save(tf.io.withSaveHandler(async (artifacts: tf.io.ModelArtifacts) => {
      savedArtifacts = artifacts;
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    }));

    if (!savedArtifacts) {
      throw new Error('Serialization failed');
    }

    return {
      json: JSON.stringify({
        modelTopology: savedArtifacts.modelTopology,
        weightSpecs: savedArtifacts.weightSpecs
      }),
      weights: savedArtifacts.weightData as ArrayBuffer,
    };
  }

  async load(json: string, weights: ArrayBuffer): Promise<void> {
    await GazeMLPModel.ensureBackendReady();

    const parsed = JSON.parse(json);
    this.model = await tf.loadLayersModel(tf.io.fromMemory({
      modelTopology: parsed.modelTopology,
      weightSpecs: parsed.weightSpecs,
      weightData: weights
    }));
  }
}
