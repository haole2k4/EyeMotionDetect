export interface CalibrationSample {
  features: number[];
  screenX: number;
  screenY: number;
  timestamp: number;
  viewportWidth?: number;
  viewportHeight?: number;
  userId?: string;
}

export interface GazeFeatures {
  irisXLeft: number;
  irisYLeft: number;
  irisXRight: number;
  irisYRight: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  earLeft: number;
  earRight: number;
  faceDetected: boolean;
  isOccluded?: boolean;

  // Extended 18D & pipeline fields
  iod?: number;
  faceX?: number;
  faceY?: number;
  feature18?: number[];
  lightingScore?: number;
  headPoseOk?: boolean;
}
