import { GazeMLPModel } from '../apps/web/lib/gaze/mlp-model';
import type { CalibrationSample } from '../apps/web/lib/gaze/types';

// Helper metrics
const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
const median = (arr: number[]) => {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const percentile = (arr: number[], p: number) => {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[idx];
};

export async function testMLPAccuracy(model: GazeMLPModel, testSamples: CalibrationSample[]) {
  const screenWidth = 1920;
  const screenHeight = 1080;

  const errors = testSamples.map(s => {
    const [px, py] = model.predict(s.features, screenWidth, screenHeight);
    return Math.hypot(px - s.screenX, py - s.screenY);
  });

  const maeValue = mean(errors);
  const medianValue = median(errors);
  const p90Value = percentile(errors, 90);
  const maxValue = Math.max(...errors);
  const pass80 = (errors.filter(e => e < 80).length / errors.length * 100);

  console.table({
    'MAE (px)':            maeValue.toFixed(1),
    'Median Error (px)':   medianValue.toFixed(1),
    'P90 Error (px)':      p90Value.toFixed(1),
    'Max Error (px)':      maxValue.toFixed(1),
    '% samples < 80px':    pass80.toFixed(0) + '%',
  });

  if (maeValue < 60) {
    console.log('✅ MLP Model Target Reached: MAE < 60px');
  } else {
    console.warn('❌ MLP Model Target Failed: MAE >= 60px');
  }

  return { maeValue, medianValue, p90Value, maxValue, pass80 };
}
