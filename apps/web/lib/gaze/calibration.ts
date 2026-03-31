import { GazeFeatures, CalibrationSample } from './types';

export type { CalibrationSample };

export class CalibrationSession {
  private samples: CalibrationSample[] = [];
  private readonly SAMPLES_PER_POINT = 25;
  private readonly STABLE_WAIT_MS    = 1200;

  async collectPoint(
    targetX: number,
    targetY: number,
    featureStream: AsyncIterable<GazeFeatures>
  ): Promise<void> {
    await this.sleep(this.STABLE_WAIT_MS);

    const buffer: number[][] = [];
    for await (const features of featureStream) {
      if (features.earLeft < 0.18 || features.earRight < 0.18) continue;

      buffer.push(this.featuresToVector(features));
      if (buffer.length >= this.SAMPLES_PER_POINT) break;
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

  private sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
  
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
