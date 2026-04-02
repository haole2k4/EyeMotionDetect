import { FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { LANDMARKS } from './mediapipe';
import { GazeFeatures } from './types';

export type { GazeFeatures };

class SimpleKalman1D {
  private x = 0;
  private v = 0;
  private p_x = 1;
  private p_v = 1;
  
  private readonly q_x = 0.001; // process noise
  private readonly q_v = 0.001;
  private readonly r = 0.01;    // observation noise
  
  private initialized = false;

  update(obs: number | null): number {
    // Predict
    this.x += this.v;
    this.p_x += this.p_v + this.q_x;
    this.p_v += this.q_v;

    // Update
    if (obs !== null) {
      if (!this.initialized) {
        this.x = obs;
        this.v = 0;
        this.initialized = true;
      } else {
        const k_x = this.p_x / (this.p_x + this.r);
        const k_v = this.p_v / (this.p_x + this.r);
        
        const inn = obs - this.x;
        this.x += k_x * inn;
        this.v += k_v * inn;
        
        this.p_x *= (1 - k_x);
        this.p_v *= (1 - k_v);
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

export function extractFeatures(
  result: FaceLandmarkerResult
): GazeFeatures | null {
  if (!result.faceLandmarks?.length) return null;

  const lm = result.faceLandmarks[0];
  const matrix = result.facialTransformationMatrixes?.[0]?.data;

  let isOccluded = false;

  const rawIrisXLeft = normalizeIrisX(
    lm[LANDMARKS.IRIS_LEFT_CENTER].x,
    lm[LANDMARKS.EYE_LEFT_INNER].x,
    lm[LANDMARKS.EYE_LEFT_OUTER].x
  );

  const rawIrisYLeft = normalizeIrisY(
    lm[LANDMARKS.IRIS_LEFT_CENTER].y,
    lm[LANDMARKS.EYE_LEFT_INNER].y,
    lm[LANDMARKS.EYE_LEFT_OUTER].y,
    Math.abs(lm[LANDMARKS.EYE_LEFT_OUTER].x - lm[LANDMARKS.EYE_LEFT_INNER].x)
  );

  const rawIrisXRight = normalizeIrisX(
    lm[LANDMARKS.IRIS_RIGHT_CENTER].x,
    lm[LANDMARKS.EYE_RIGHT_INNER].x,
    lm[LANDMARKS.EYE_RIGHT_OUTER].x,
    true // Invert for right eye
  );

  const rawIrisYRight = normalizeIrisY(
    lm[LANDMARKS.IRIS_RIGHT_CENTER].y,
    lm[LANDMARKS.EYE_RIGHT_INNER].y,
    lm[LANDMARKS.EYE_RIGHT_OUTER].y,
    Math.abs(lm[LANDMARKS.EYE_RIGHT_OUTER].x - lm[LANDMARKS.EYE_RIGHT_INNER].x)
  );

  const earLeft = computeEAR(lm, 'left');
  const earRight = computeEAR(lm, 'right');

  // isOccluded = true means the eye is physically closed or practically un-trackable.
  if (rawIrisXLeft === null || rawIrisXRight === null || rawIrisYLeft === null || rawIrisYRight === null || earLeft < 0.12 || earRight < 0.12) {
    isOccluded = true;
  }

  const irisXLeft = trackers.leftX.update(isOccluded ? null : rawIrisXLeft);
  const irisYLeft = trackers.leftY.update(isOccluded ? null : rawIrisYLeft);
  const irisXRight = trackers.rightX.update(isOccluded ? null : rawIrisXRight);
  const irisYRight = trackers.rightY.update(isOccluded ? null : rawIrisYRight);

  const { pitch, yaw, roll } = matrix
    ? extractEulerAngles(matrix)
    : { pitch: 0, yaw: 0, roll: 0 };

  return {
    irisXLeft, irisYLeft, irisXRight, irisYRight,
    headPitch: pitch / 90.0, headYaw: yaw / 90.0, headRoll: roll / 90.0,
    earLeft, earRight, faceDetected: true, isOccluded
  };
}

function normalizeIrisX(irisPos: number, edgeA: number, edgeB: number, invert = false): number | null {
  const range = Math.abs(edgeB - edgeA);
  if (range < 0.001) return null;
  const val = Math.max(0, Math.min(1, (irisPos - Math.min(edgeA, edgeB)) / range));
  return invert ? 1 - val : val;
}

function normalizeIrisY(irisY: number, innerCornerY: number, outerCornerY: number, eyeWidth: number): number | null {
  if (eyeWidth < 0.001) return null;
  // Use the average of inner and outer corner as the center reference
  const eyeCenterY = (innerCornerY + outerCornerY) / 2.0;

  // The difference relative to eye width
  const diff = (irisY - eyeCenterY) / eyeWidth;
  
  // Amplify the difference to span a wider range [0, 1]. 
  // Typically diff is around -0.15 (looking up) to +0.15 (looking down)
  // Multiplying by 3.5 makes it spread more cleanly
  const val = Math.max(0, Math.min(1, diff * 3.5 + 0.5));
  return val;
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
