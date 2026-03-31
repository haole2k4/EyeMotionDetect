import { transpose, multiply, add, identity, inverse } from '../math/matrix';
import { CalibrationSample } from './types';

export class PolynomialGazeMapper {
  private coeffsX: number[] = [];
  private coeffsY: number[] = [];
  
  private expand(f: number[]): number[] {
    const [x1, y1, x2, y2, p, y, r] = f;
    return [
      1,
      x1, y1, x2, y2, p, y, r,
      x1*x1, y1*y1, x2*x2, y2*y2,
      p*p, y*y,
      x1*y1, x2*y2,
      x1*y, x2*y,
      y1*p, y2*p,
    ];
  }

  fit(samples: CalibrationSample[]): { maeX: number; maeY: number; r2X: number; r2Y: number } {
    const X = samples.map(s => this.expand(s.features));
    const yX = samples.map(s => [s.screenX]);
    const yY = samples.map(s => [s.screenY]);
    
    this.coeffsX = this.ridgeRegression(X, yX, 0.01).map(row => row[0]);
    this.coeffsY = this.ridgeRegression(X, yY, 0.01).map(row => row[0]);

    const predX = samples.map(s => this.predict(s.features)[0]);
    const predY = samples.map(s => this.predict(s.features)[1]);

    const trueX = samples.map(s => s.screenX);
    const trueY = samples.map(s => s.screenY);

    return {
      maeX: this.mae(predX, trueX),
      maeY: this.mae(predY, trueY),
      r2X:  this.r2score(predX, trueX),
      r2Y:  this.r2score(predY, trueY),
    };
  }

  predict(features: number[]): [number, number] {
    const x = this.expand(features);
    return [
      this.dot(this.coeffsX, x),
      this.dot(this.coeffsY, x)
    ];
  }

  private ridgeRegression(X: number[][], y: number[][], lambda: number): number[][] {
    const XT = transpose(X);
    const XTX = multiply(XT, X);
    const penalty = identity(XTX.length).map(row => row.map(v => v * lambda));
    const XTX_reg = add(XTX, penalty);
    const inv = inverse(XTX_reg);
    const inv_XT = multiply(inv, XT);
    return multiply(inv_XT, y);
  }

  private dot(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private mae(pred: number[], actual: number[]): number {
    return pred.reduce((sum, p, i) => sum + Math.abs(p - actual[i]), 0) / pred.length;
  }

  private r2score(pred: number[], actual: number[]): number {
    const mean = actual.reduce((a, b) => a + b, 0) / actual.length;
    const ssTot = actual.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
    const ssRes = pred.reduce((sum, p, i) => sum + Math.pow(actual[i] - p, 2), 0);
    if (ssTot === 0) return 1;
    return 1 - (ssRes / ssTot);
  }

  serialize() {
    return { coeffsX: this.coeffsX, coeffsY: this.coeffsY };
  }

  load(data: { coeffsX: number[]; coeffsY: number[] }) {
    this.coeffsX = data.coeffsX;
    this.coeffsY = data.coeffsY;
  }
}
