import { GazeFeatures, CalibrationSample } from './types';

export type { CalibrationSample };

export class CalibrationSession {
  private samples: CalibrationSample[] = [];
  private readonly SAMPLES_PER_POINT = 25;
  private readonly STABLE_WAIT_MS    = 1200;

  async collectPoint(
    targetX: number,
    targetY: number,
    featureStream: AsyncIterable<GazeFeatures>,
    signal?: AbortSignal,
    earThreshold?: number
  ): Promise<void> {
    this.throwIfAborted(signal);
    await this.sleep(this.STABLE_WAIT_MS, signal);

    const buffer: number[][] = [];
    for await (const features of featureStream) {
      this.throwIfAborted(signal);
      
      const threshold = earThreshold ? earThreshold * 1.25 : 0.18; // 0.75 * baseline = 1.25 * RATIO
      if (features.earLeft < threshold || features.earRight < threshold) continue;

      buffer.push(this.featuresToVector(features));
      if (buffer.length >= this.SAMPLES_PER_POINT) break;
    }

    if (buffer.length === 0) {
      throw new Error('Khong thu duoc mau du lieu cho diem calibration');
    }

    const medianFeatures = this.vectorMedian(buffer);
    this.samples.push({
      features: medianFeatures,
      screenX: targetX,
      screenY: targetY,
      timestamp: Date.now()
    });
  }

  private featuresToVector(f: GazeFeatures): number[] {
    return [f.irisXLeft, f.irisYLeft, f.irisXRight, f.irisYRight,
            f.headPitch, f.headYaw, f.headRoll];
  }

  getSamples(): CalibrationSample[] { return this.samples; }

  private sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(new Error('Calibration da bi huy'));
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  private throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
      throw new Error('Calibration da bi huy');
    }
  }
  
  private vectorMedian(buffer: number[][]): number[] {
    const numFeatures = buffer[0].length;
    const median = new Array(numFeatures);
    for (let c = 0; c < numFeatures; c++) {
      const col = buffer.map(row => row[c]).sort((a, b) => a - b);
      const mid = Math.floor(col.length / 2);
      median[c] = col.length % 2 !== 0 ? col[mid] : (col[mid - 1] + col[mid]) / 2;
    }
    return median;
  }
}
