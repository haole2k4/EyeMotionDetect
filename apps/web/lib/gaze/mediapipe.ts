import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export const LANDMARKS = {
  IRIS_LEFT_CENTER:  468,
  IRIS_RIGHT_CENTER: 473,
  
  EYE_LEFT_OUTER:    33,
  EYE_LEFT_INNER:    133,
  EYE_LEFT_TOP_1:    160,
  EYE_LEFT_TOP_2:    158,
  EYE_LEFT_BOT_1:    144,
  EYE_LEFT_BOT_2:    153,

  EYE_RIGHT_OUTER:   263,
  EYE_RIGHT_INNER:   362,
  EYE_RIGHT_TOP_1:   385,
  EYE_RIGHT_TOP_2:   387,
  EYE_RIGHT_BOT_1:   380,
  EYE_RIGHT_BOT_2:   373,
} as const;

export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const filesetResolver = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  return FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
    runningMode: 'VIDEO',
    numFaces: 1,
  });
}
