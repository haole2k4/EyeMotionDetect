import { openDB } from 'idb';

const DB_NAME = 'gaze-store';
const STORE_NAME = 'calibration';

export interface StoredCalibration {
  activeModel: 'polynomial' | 'mlp';
  polyCoeffs?: { coeffsX: number[]; coeffsY: number[] };
  mlpModel?: { json: string; weights: ArrayBuffer };
  earThreshold: number;
  savedAt: number;
}

export async function initStorage() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    }
  });
}

export async function saveCalibrationLocally(coeffsX: number[], coeffsY: number[], earThreshold: number) {
  const db = await initStorage();
  
  // Lấy dữ liệu cũ để tránh mất MLP data nếu đã có
  const current = await db.get(STORE_NAME, 'current');
  
  await db.put(STORE_NAME, {
    ...current,
    activeModel: 'polynomial',
    polyCoeffs: { coeffsX, coeffsY },
    earThreshold,
    savedAt: Date.now()
  }, 'current');
}

export async function saveMLPLocally(json: string, weights: ArrayBuffer, earThreshold: number) {
  const db = await initStorage();
  
  const current = await db.get(STORE_NAME, 'current');

  await db.put(STORE_NAME, {
    ...current,
    activeModel: 'mlp',
    mlpModel: { json, weights },
    earThreshold,
    savedAt: Date.now()
  }, 'current');
}

export async function getCalibrationLocally(): Promise<StoredCalibration | undefined> {
  const db = await initStorage();
  return db.get(STORE_NAME, 'current') as Promise<StoredCalibration | undefined>;
}
