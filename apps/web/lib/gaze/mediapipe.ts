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
  const customGlobal = globalThis as unknown as {
    __faceLandmarkerPromise?: Promise<FaceLandmarker>;
  };
  
  if (customGlobal.__faceLandmarkerPromise) {
    return customGlobal.__faceLandmarkerPromise;
  }

  customGlobal.__faceLandmarkerPromise = (async () => {
    // Lọc console.error do MediaPipe cố log trạng thái WebAssembly nội bộ (gây tràn Overlay trong Next.js)
    const originalConsoleError = console.error;
    console.error = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes('XNNPACK')) return;
      originalConsoleError(...args);
    };

    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      // Keep >1 so runtime can lock control whenever multiple faces appear.
      numFaces: 2,
    });

    return landmarker;
  })();

  return customGlobal.__faceLandmarkerPromise;
}
