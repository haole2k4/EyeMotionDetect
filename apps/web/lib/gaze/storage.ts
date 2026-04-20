import { openDB } from 'idb';
import type { CalibrationSample } from './types';

const DB_NAME = 'gaze-store';
const STORE_NAME = 'calibration';

export interface StoredCalibration {
  activeModel?: 'polynomial' | 'mlp';
  polyCoeffs?: { coeffsX: number[]; coeffsY: number[] };
  mlpModel?: { json: string; weights: ArrayBuffer };
  calibrationSamples?: CalibrationSample[];
  sampleCount?: number;
  rounds?: number;
  earThreshold?: number;
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

export async function saveCalibrationLocally(
  coeffsX: number[],
  coeffsY: number[],
  earThreshold: number,
  sampleCount?: number,
  rounds?: number,
) {
  const db = await initStorage();
  
  // Lấy dữ liệu cũ để tránh mất MLP data nếu đã có
  const current = await db.get(STORE_NAME, 'current');
  
  await db.put(STORE_NAME, {
    ...current,
    activeModel: 'polynomial',
    polyCoeffs: { coeffsX, coeffsY },
    sampleCount: sampleCount ?? current?.sampleCount,
    rounds: rounds ?? current?.rounds,
    earThreshold,
    savedAt: Date.now()
  }, 'current');
}

export async function saveMLPLocally(
  json: string,
  weights: ArrayBuffer,
  earThreshold: number,
  sampleCount?: number,
  rounds?: number,
) {
  const db = await initStorage();
  
  const current = await db.get(STORE_NAME, 'current');

  await db.put(STORE_NAME, {
    ...current,
    activeModel: 'mlp',
    mlpModel: { json, weights },
    sampleCount: sampleCount ?? current?.sampleCount,
    rounds: rounds ?? current?.rounds,
    earThreshold,
    savedAt: Date.now()
  }, 'current');
}

export async function saveCalibrationSamplesLocally(samples: CalibrationSample[], rounds: number) {
  const db = await initStorage();

  await db.put(STORE_NAME, {
    calibrationSamples: samples,
    sampleCount: samples.length,
    rounds,
    savedAt: Date.now(),
  }, 'current');
}

export async function getCalibrationSamplesLocally(): Promise<CalibrationSample[]> {
  const current = await getCalibrationLocally();
  return current?.calibrationSamples ?? [];
}

export async function getCalibrationLocally(): Promise<StoredCalibration | undefined> {
  const db = await initStorage();
  return db.get(STORE_NAME, 'current') as Promise<StoredCalibration | undefined>;
}

export async function resetCalibrationLocally() {
  const db = await initStorage();
  await db.delete(STORE_NAME, 'current');
}
