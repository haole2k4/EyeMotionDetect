import { FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { LANDMARKS } from './mediapipe';
import { GazeFeatures } from './types';

export type { GazeFeatures };

class SimpleKalman1D {
  private x = 0;
  private v = 0;
  private p_xx = 1;
  private p_xv = 0;
  private p_vx = 0;
  private p_vv = 1;

  private readonly q_x = 0.001;
  private readonly q_v = 0.001;
  private readonly r = 0.008;

  private initialized = false;

  update(obs: number | null): number {
    // Predict step (assuming dt approx 0.016s)
    const dt = 0.016;
    this.x += this.v * dt;
    this.p_xx += dt * (this.p_vx + this.p_xv) + dt * dt * this.p_vv + this.q_x;
    this.p_xv += dt * this.p_vv;
    this.p_vx += dt * this.p_vv;
    this.p_vv += this.q_v;

    if (obs !== null && !Number.isNaN(obs)) {
      if (!this.initialized) {
        this.x = obs;
        this.v = 0;
        this.initialized = true;
      } else {
        const s = this.p_xx + this.r;
        if (Math.abs(s) > 1e-12) {
          const k_x = this.p_xx / s;
          const k_v = this.p_vx / s;
          const inn = obs - this.x;

          this.x += k_x * inn;
          this.v += k_v * inn;

          const p_xx_temp = (1.0 - k_x) * this.p_xx;
          const p_xv_temp = (1.0 - k_x) * this.p_xv;
          const p_vx_temp = -k_v * this.p_xx + this.p_vx;
          const p_vv_temp = -k_v * this.p_xv + this.p_vv;

          const sym = 0.5 * (p_xv_temp + p_vx_temp);
          this.p_xx = p_xx_temp;
          this.p_xv = sym;
          this.p_vx = sym;
          this.p_vv = p_vv_temp;
        }
      }
    }
    this.x = Math.max(0, Math.min(1, this.x));
    return this.x;
  }
}

const trackers = {
  leftX: new SimpleKalman1D(),
  leftY: new SimpleKalman1D(),
  rightX: new SimpleKalman1D(),
  rightY: new SimpleKalman1D(),
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function computeIrisCentroid(lm: NormalizedLandmark[], startIdx: number): { x: number; y: number } {
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < 5; i++) {
    sumX += lm[startIdx + i].x;
    sumY += lm[startIdx + i].y;
  }
  return { x: sumX * 0.2, y: sumY * 0.2 };
}

function extractSingleEyeCoords(
  inner: { x: number; y: number },
  outer: { x: number; y: number },
  irisCentroid: { x: number; y: number },
  isRightEye: boolean
): { x: number; y: number } | null {
  const dx = outer.x - inner.x;
  const dy = outer.y - inner.y;
  const w = Math.hypot(dx, dy);

  if (w < 1e-5) return null;

  const ux = dx / w;
  const uy = dy / w;

  let vx = -uy;
  let vy = ux;
  if (vy < 0) {
    vx = uy;
    vy = -ux;
  }

  const relIrisX = irisCentroid.x - inner.x;
  const relIrisY = irisCentroid.y - inner.y;

  const projU = (relIrisX * ux + relIrisY * uy) / w;
  const xRaw = clamp01(projU);
  const xNorm = isRightEye ? 1 - xRaw : xRaw;

  const midX = 0.5 * (inner.x + outer.x);
  const midY = 0.5 * (inner.y + outer.y);

  const relMidX = irisCentroid.x - midX;
  const relMidY = irisCentroid.y - midY;

  const projV = (relMidX * vx + relMidY * vy) / w;
  const yNorm = clamp01(0.5 + 3.0 * projV);

  return { x: xNorm, y: yNorm };
}

export function buildFeatureVector18D(
  lx: number,
  ly: number,
  rx: number,
  ry: number,
  pitch: number,
  yaw: number,
  roll: number,
  iod = 0.12,
  faceX = 0.0,
  faceY = 0.0
): number[] {
  return [
    1.0,
    lx,
    ly,
    rx,
    ry,
    pitch,
    yaw,
    roll,
    iod,
    faceX,
    faceY,
    lx * lx,
    ly * ly,
    rx * rx,
    ry * ry,
    lx * yaw,
    rx * yaw,
    0.5 * (ly + ry) * pitch,
  ];
}

export function expand7Dto18D(f7: number[]): number[] {
  const [lx, ly, rx, ry, pitch, yaw, roll] = f7;
  return buildFeatureVector18D(lx, ly, rx, ry, pitch, yaw, roll, 0.12, 0.0, 0.0);
}

export function extractFeatures(
  result: FaceLandmarkerResult
): GazeFeatures | null {
  if (!result.faceLandmarks?.length) return null;

  const lm = result.faceLandmarks[0];
  const matrix = result.facialTransformationMatrixes?.[0]?.data;

  const leftInner = lm[LANDMARKS.EYE_LEFT_INNER];
  const leftOuter = lm[LANDMARKS.EYE_LEFT_OUTER];
  const rightInner = lm[LANDMARKS.EYE_RIGHT_INNER];
  const rightOuter = lm[LANDMARKS.EYE_RIGHT_OUTER];

  const leftIrisCenter = computeIrisCentroid(lm, 468);
  const rightIrisCenter = computeIrisCentroid(lm, 473);

  const leftCoords = extractSingleEyeCoords(leftInner, leftOuter, leftIrisCenter, false);
  const rightCoords = extractSingleEyeCoords(rightInner, rightOuter, rightIrisCenter, true);

  const earLeft = computeEAR(lm, 'left');
  const earRight = computeEAR(lm, 'right');

  let isOccluded = false;
  if (!leftCoords || !rightCoords || earLeft < 0.12 || earRight < 0.12) {
    isOccluded = true;
  }

  const rawIrisXLeft = leftCoords?.x ?? null;
  const rawIrisYLeft = leftCoords?.y ?? null;
  const rawIrisXRight = rightCoords?.x ?? null;
  const rawIrisYRight = rightCoords?.y ?? null;

  const irisXLeft = trackers.leftX.update(isOccluded ? null : rawIrisXLeft);
  const irisYLeft = trackers.leftY.update(isOccluded ? null : rawIrisYLeft);
  const irisXRight = trackers.rightX.update(isOccluded ? null : rawIrisXRight);
  const irisYRight = trackers.rightY.update(isOccluded ? null : rawIrisYRight);

  const { pitch, yaw, roll } = matrix
    ? extractEulerAngles(matrix)
    : { pitch: 0, yaw: 0, roll: 0 };

  const iod = Math.hypot(rightInner.x - leftInner.x, rightInner.y - leftInner.y);
  const faceX = 0.25 * (leftInner.x + leftOuter.x + rightInner.x + rightOuter.x) - 0.5;
  const faceY = 0.25 * (leftInner.y + leftOuter.y + rightInner.y + rightOuter.y) - 0.5;

  const normPitch = pitch / 90.0;
  const normYaw = yaw / 90.0;
  const normRoll = roll / 90.0;

  const feature18 = buildFeatureVector18D(
    irisXLeft,
    irisYLeft,
    irisXRight,
    irisYRight,
    normPitch,
    normYaw,
    normRoll,
    iod,
    faceX,
    faceY
  );

  const headPoseOk =
    Math.abs(pitch) < 25 &&
    Math.abs(yaw) < 28 &&
    Math.abs(roll) < 22 &&
    iod > 0.045;

  // Approximate lighting score based on landmark clarity / ear stability
  const lightingScore = clamp01((earLeft + earRight) / 0.55);

  return {
    irisXLeft,
    irisYLeft,
    irisXRight,
    irisYRight,
    headPitch: normPitch,
    headYaw: normYaw,
    headRoll: normRoll,
    earLeft,
    earRight,
    faceDetected: true,
    isOccluded,
    iod,
    faceX,
    faceY,
    feature18,
    lightingScore,
    headPoseOk,
  };
}

function extractEulerAngles(m: number[] | Float32Array): { pitch: number; yaw: number; roll: number } {
  const pitch = Math.atan2(-m[9], m[10]) * (180 / Math.PI);
  const yaw = Math.atan2(m[8], Math.sqrt(m[9] ** 2 + m[10] ** 2)) * (180 / Math.PI);
  const roll = Math.atan2(-m[4], m[0]) * (180 / Math.PI);
  return { pitch, yaw, roll };
}

function computeEAR(lm: NormalizedLandmark[], eye: 'left' | 'right'): number {
  const idx = eye === 'left'
    ? [LANDMARKS.EYE_LEFT_OUTER, LANDMARKS.EYE_LEFT_TOP_1, LANDMARKS.EYE_LEFT_TOP_2,
    LANDMARKS.EYE_LEFT_INNER, LANDMARKS.EYE_LEFT_BOT_1, LANDMARKS.EYE_LEFT_BOT_2]
    : [LANDMARKS.EYE_RIGHT_OUTER, LANDMARKS.EYE_RIGHT_TOP_1, LANDMARKS.EYE_RIGHT_TOP_2,
    LANDMARKS.EYE_RIGHT_INNER, LANDMARKS.EYE_RIGHT_BOT_1, LANDMARKS.EYE_RIGHT_BOT_2];

  const dist = (a: number, b: number) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  return (dist(idx[1], idx[5]) + dist(idx[2], idx[4])) / (2 * dist(idx[0], idx[3]));
}
