import { FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { LANDMARKS } from './mediapipe';
import { GazeFeatures } from './types';

export type { GazeFeatures };

export function extractFeatures(
  result: FaceLandmarkerResult
): GazeFeatures | null {
  if (!result.faceLandmarks?.length) return null;

  const lm = result.faceLandmarks[0];
  const matrix = result.facialTransformationMatrixes?.[0]?.data;

  const irisXLeft = normalizeIris(
    lm[LANDMARKS.IRIS_LEFT_CENTER].x,
    lm[LANDMARKS.EYE_LEFT_INNER].x,
    lm[LANDMARKS.EYE_LEFT_OUTER].x
  );

  const irisYLeft = normalizeIris(
    lm[LANDMARKS.IRIS_LEFT_CENTER].y,
    lm[LANDMARKS.EYE_LEFT_TOP_1].y,
    lm[LANDMARKS.EYE_LEFT_BOT_1].y
  );

  const irisXRight = 1 - normalizeIris(
    lm[LANDMARKS.IRIS_RIGHT_CENTER].x,
    lm[LANDMARKS.EYE_RIGHT_INNER].x,
    lm[LANDMARKS.EYE_RIGHT_OUTER].x
  );

  const irisYRight = normalizeIris(
    lm[LANDMARKS.IRIS_RIGHT_CENTER].y,
    lm[LANDMARKS.EYE_RIGHT_TOP_1].y,
    lm[LANDMARKS.EYE_RIGHT_BOT_1].y
  );

  const { pitch, yaw, roll } = matrix
    ? extractEulerAngles(matrix)
    : { pitch: 0, yaw: 0, roll: 0 };

  const earLeft  = computeEAR(lm, 'left');
  const earRight = computeEAR(lm, 'right');

  return {
    irisXLeft, irisYLeft, irisXRight, irisYRight,
    headPitch: pitch, headYaw: yaw, headRoll: roll,
    earLeft, earRight, faceDetected: true
  };
}

function normalizeIris(irisPos: number, edgeA: number, edgeB: number): number {
  const range = Math.abs(edgeB - edgeA);
  if (range < 0.001) return 0.5;
  return Math.max(0, Math.min(1, (irisPos - Math.min(edgeA, edgeB)) / range));
}

function extractEulerAngles(m: number[] | Float32Array): { pitch: number; yaw: number; roll: number } {
  const pitch = Math.atan2(-m[9], m[10]) * (180 / Math.PI);
  const yaw   = Math.atan2(m[8], Math.sqrt(m[9]**2 + m[10]**2)) * (180 / Math.PI);
  const roll  = Math.atan2(-m[4], m[0]) * (180 / Math.PI);
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
