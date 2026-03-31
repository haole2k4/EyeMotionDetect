export interface CalibrationSample {
  features: number[];
  screenX: number;
  screenY: number;
  timestamp: number;
}

export interface GazeFeatures {
  irisXLeft:  number;
  irisYLeft:  number;
  irisXRight: number;
  irisYRight: number;
  headPitch: number;
  headYaw:   number;
  headRoll:  number;
  earLeft:  number;
  earRight: number;
  faceDetected: boolean;
}
