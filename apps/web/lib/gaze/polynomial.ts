import { CalibrationSample } from './types';
import { expand7Dto18D } from './feature-extractor';

export interface CalibrationFitResult {
  maeX: number;
  maeY: number;
  mae2D: number;
  r2X: number;
  r2Y: number;
  inlierRatio: number;
  inlierMae2D: number;
}

export function solveSymmetric18x18(
  A: number[][],
  bx: number[],
  by: number[]
): [number[], number[]] {
  const d: number[][] = A.map((row) => [...row]);
  const v: number[][] = Array.from({ length: 18 }, (_, i) => {
    const row = new Array<number>(18).fill(0);
    row[i] = 1;
    return row;
  });

  // Cyclic Jacobi sweeps
  for (let sweep = 0; sweep < 8; sweep++) {
    let maxOffDiag = 0;
    for (let p = 0; p < 17; p++) {
      for (let q = p + 1; q < 18; q++) {
        const off = Math.abs(d[p][q]);
        if (off > maxOffDiag) maxOffDiag = off;
      }
    }
    if (maxOffDiag < 1e-10) break;

    for (let p = 0; p < 17; p++) {
      for (let q = p + 1; q < 18; q++) {
        const d_pq = d[p][q];
        if (Math.abs(d_pq) < 1e-15) continue;

        const h = d[q][q] - d[p][p];
        let t: number;
        if (Math.abs(h) + Math.abs(d_pq) === Math.abs(h)) {
          t = d_pq / h;
        } else {
          const phi = h / (2 * d_pq);
          let tVal = 1 / (Math.abs(phi) + Math.sqrt(1 + phi * phi));
          if (phi < 0) tVal = -tVal;
          t = tVal;
        }

        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        const tau = s / (1 + c);

        d[p][q] = 0;
        d[q][p] = 0;
        d[p][p] -= t * d_pq;
        d[q][q] += t * d_pq;

        for (let r = 0; r < p; r++) {
          const g = d[r][p];
          const hVal = d[r][q];
          d[r][p] = g - s * (hVal + g * tau);
          d[p][r] = d[r][p];
          d[r][q] = hVal + s * (g - hVal * tau);
          d[q][r] = d[r][q];
        }

        for (let r = p + 1; r < q; r++) {
          const g = d[p][r];
          const hVal = d[r][q];
          d[p][r] = g - s * (hVal + g * tau);
          d[r][p] = d[p][r];
          d[r][q] = hVal + s * (g - hVal * tau);
          d[q][r] = d[r][q];
        }

        for (let r = q + 1; r < 18; r++) {
          const g = d[p][r];
          const hVal = d[q][r];
          d[p][r] = g - s * (hVal + g * tau);
          d[r][p] = d[p][r];
          d[q][r] = hVal + s * (g - hVal * tau);
          d[r][q] = d[q][r];
        }

        for (let r = 0; r < 18; r++) {
          const g = v[r][p];
          const hVal = v[r][q];
          v[r][p] = g - s * (hVal + g * tau);
          v[r][q] = hVal + s * (g - hVal * tau);
        }
      }
    }
  }

  let sigmaMax = 0;
  for (let j = 0; j < 18; j++) {
    const ev = Math.abs(d[j][j]);
    if (ev > sigmaMax) sigmaMax = ev;
  }

  const threshold = 1e-8 * sigmaMax;
  const invD = new Array<number>(18).fill(0);
  for (let j = 0; j < 18; j++) {
    const ev = d[j][j];
    invD[j] = ev > threshold ? 1 / ev : 0;
  }

  const yx = new Array<number>(18).fill(0);
  const yy = new Array<number>(18).fill(0);
  for (let j = 0; j < 18; j++) {
    let sumX = 0;
    let sumY = 0;
    for (let r = 0; r < 18; r++) {
      sumX += v[r][j] * bx[r];
      sumY += v[r][j] * by[r];
    }
    yx[j] = sumX * invD[j];
    yy[j] = sumY * invD[j];
  }

  const wx = new Array<number>(18).fill(0);
  const wy = new Array<number>(18).fill(0);
  for (let k = 0; k < 18; k++) {
    let sumX = 0;
    let sumY = 0;
    for (let j = 0; j < 18; j++) {
      sumX += v[k][j] * yx[j];
      sumY += v[k][j] * yy[j];
    }
    wx[k] = sumX;
    wy[k] = sumY;
  }

  return [wx, wy];
}

export class PolynomialGazeMapper {
  public coeffsX: number[] = new Array<number>(18).fill(0);
  public coeffsY: number[] = new Array<number>(18).fill(0);
  public isCalibrated = false;

  expand(f: number[]): number[] {
    if (f.length === 18) {
      return [...f];
    }
    if (f.length === 7) {
      return expand7Dto18D(f);
    }
    // Pad or fallback
    const res = new Array<number>(18).fill(0);
    res[0] = 1;
    for (let i = 0; i < Math.min(18, f.length); i++) {
      res[i] = f[i];
    }
    return res;
  }

  fit(
    samples: CalibrationSample[],
    lambda = 0.005,
    huberDelta = 45.0
  ): CalibrationFitResult {
    const n = samples.length;
    if (n < 4) {
      throw new Error(`Insufficient calibration samples: got ${n}, minimum required 4`);
    }

    const X = samples.map((s) => this.expand(s.features));
    const targetX = samples.map((s) => s.screenX);
    const targetY = samples.map((s) => s.screenY);

    const weights = new Array<number>(n).fill(1.0);
    let currentDelta = huberDelta;
    let wx = new Array<number>(18).fill(0);
    let wy = new Array<number>(18).fill(0);

    for (let iter = 0; iter < 5; iter++) {
      const A: number[][] = Array.from({ length: 18 }, () => new Array<number>(18).fill(0));
      const bx: number[] = new Array<number>(18).fill(0);
      const by: number[] = new Array<number>(18).fill(0);

      for (let i = 0; i < n; i++) {
        const w = weights[i];
        const feat = X[i];
        const tx = targetX[i];
        const ty = targetY[i];

        for (let j = 0; j < 18; j++) {
          const wFeatJ = w * feat[j];
          bx[j] += wFeatJ * tx;
          by[j] += wFeatJ * ty;

          for (let k = j; k < 18; k++) {
            A[j][k] += wFeatJ * feat[k];
          }
        }
      }

      for (let j = 0; j < 18; j++) {
        A[j][j] += lambda;
        for (let k = j + 1; k < 18; k++) {
          A[k][j] = A[j][k];
        }
      }

      const [solX, solY] = solveSymmetric18x18(A, bx, by);
      wx = solX;
      wy = solY;

      if (iter < 4) {
        const residuals: number[] = [];
        for (let i = 0; i < n; i++) {
          const feat = X[i];
          let px = 0;
          let py = 0;
          for (let j = 0; j < 18; j++) {
            px += wx[j] * feat[j];
            py += wy[j] * feat[j];
          }
          const res = Math.hypot(px - targetX[i], py - targetY[i]);
          residuals.push(res);
        }

        const sortedRes = [...residuals].sort((a, b) => a - b);
        const mid = Math.floor(n / 2);
        const medianRes = n % 2 === 1 ? sortedRes[mid] : 0.5 * (sortedRes[mid - 1] + sortedRes[mid]);
        currentDelta = Math.max(35.0, 1.345 * medianRes);

        for (let i = 0; i < n; i++) {
          const r = residuals[i];
          weights[i] = r <= currentDelta ? 1.0 : currentDelta / r;
        }
      }
    }

    this.coeffsX = wx;
    this.coeffsY = wy;
    this.isCalibrated = true;

    // Metrics computation
    let sumErrX = 0;
    let sumErrY = 0;
    let sumErr2D = 0;
    let sumTargetX = 0;
    let sumTargetY = 0;

    let inlierCount = 0;
    let inlierSumErr2D = 0;

    const predsX: number[] = [];
    const predsY: number[] = [];

    for (let i = 0; i < n; i++) {
      const feat = X[i];
      let px = 0;
      let py = 0;
      for (let j = 0; j < 18; j++) {
        px += wx[j] * feat[j];
        py += wy[j] * feat[j];
      }
      predsX.push(px);
      predsY.push(py);

      const errX = Math.abs(px - targetX[i]);
      const errY = Math.abs(py - targetY[i]);
      const err2D = Math.hypot(px - targetX[i], py - targetY[i]);

      sumErrX += errX;
      sumErrY += errY;
      sumErr2D += err2D;
      sumTargetX += targetX[i];
      sumTargetY += targetY[i];

      if (err2D <= currentDelta) {
        inlierCount++;
        inlierSumErr2D += err2D;
      }
    }

    const meanTargetX = sumTargetX / n;
    const meanTargetY = sumTargetY / n;
    let ssTotX = 0;
    let ssTotY = 0;
    let ssResX = 0;
    let ssResY = 0;

    for (let i = 0; i < n; i++) {
      ssTotX += (targetX[i] - meanTargetX) ** 2;
      ssTotY += (targetY[i] - meanTargetY) ** 2;
      ssResX += (targetX[i] - predsX[i]) ** 2;
      ssResY += (targetY[i] - predsY[i]) ** 2;
    }

    const r2X = ssTotX > 1e-10 ? Math.max(0, 1 - ssResX / ssTotX) : 1.0;
    const r2Y = ssTotY > 1e-10 ? Math.max(0, 1 - ssResY / ssTotY) : 1.0;

    return {
      maeX: sumErrX / n,
      maeY: sumErrY / n,
      mae2D: sumErr2D / n,
      r2X,
      r2Y,
      inlierRatio: inlierCount / n,
      inlierMae2D: inlierCount > 0 ? inlierSumErr2D / inlierCount : sumErr2D / n,
    };
  }

  predict(features: number[]): [number, number] {
    const feat = this.expand(features);
    let px = 0;
    let py = 0;
    for (let j = 0; j < 18; j++) {
      px += this.coeffsX[j] * feat[j];
      py += this.coeffsY[j] * feat[j];
    }
    return [px, py];
  }

  serialize(): { coeffsX: number[]; coeffsY: number[] } {
    return { coeffsX: [...this.coeffsX], coeffsY: [...this.coeffsY] };
  }

  load(data: { coeffsX: number[]; coeffsY: number[] }): void {
    this.coeffsX = [...data.coeffsX];
    this.coeffsY = [...data.coeffsY];
    this.isCalibrated = true;
  }
}
