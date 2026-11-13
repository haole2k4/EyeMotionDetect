import { openDB } from 'idb';
import type { CalibrationSample } from './types';

const DB_NAME = 'gaze-store';
const STORE_NAME = 'calibration';
const LEGACY_KEY = 'current';
const ANONYMOUS_KEY = 'anonymous';

export function getCurrentUserStorageKey(explicitUserKey?: string): string {
  const trimmedExplicit = explicitUserKey?.trim();
  if (trimmedExplicit) {
    if (trimmedExplicit === ANONYMOUS_KEY || trimmedExplicit.startsWith('user:')) {
      return trimmedExplicit;
    }
    return `user:${trimmedExplicit}`;
  }

  if (typeof window === 'undefined') {
    return ANONYMOUS_KEY;
  }

  try {
    const rawUser = window.localStorage.getItem('user');
    if (!rawUser) {
      return ANONYMOUS_KEY;
    }
    const parsed = JSON.parse(rawUser) as { id?: string; email?: string };
    const identifier = parsed?.id?.trim() || parsed?.email?.trim();
    return identifier ? `user:${identifier}` : ANONYMOUS_KEY;
  } catch {
    return ANONYMOUS_KEY;
  }
}

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
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    }
  });

  try {
    await db.delete(STORE_NAME, LEGACY_KEY);
  } catch {
    // Ignore cleanup errors for legacy unscoped key
  }

  return db;
}

export async function saveCalibrationLocally(
  coeffsX: number[],
  coeffsY: number[],
  earThreshold: number,
  sampleCount?: number,
  rounds?: number,
  userKey?: string,
) {
  const db = await initStorage();
  const storageKey = getCurrentUserStorageKey(userKey);

  // Lấy dữ liệu cũ để tránh mất MLP data nếu đã có
  const current = await db.get(STORE_NAME, storageKey);

  await db.put(STORE_NAME, {
    ...current,
    activeModel: 'polynomial',
    polyCoeffs: { coeffsX, coeffsY },
    sampleCount: sampleCount ?? current?.sampleCount,
    rounds: rounds ?? current?.rounds,
    earThreshold,
    savedAt: Date.now()
  }, storageKey);
}

export async function saveMLPLocally(
  json: string,
  weights: ArrayBuffer,
  earThreshold: number,
  sampleCount?: number,
  rounds?: number,
  userKey?: string,
) {
  const db = await initStorage();
  const storageKey = getCurrentUserStorageKey(userKey);

  const current = await db.get(STORE_NAME, storageKey);

  await db.put(STORE_NAME, {
    ...current,
    activeModel: 'mlp',
    mlpModel: { json, weights },
    sampleCount: sampleCount ?? current?.sampleCount,
    rounds: rounds ?? current?.rounds,
    earThreshold,
    savedAt: Date.now()
  }, storageKey);
}

export async function saveCalibrationSamplesLocally(
  samples: CalibrationSample[],
  rounds: number,
  userKey?: string,
) {
  const db = await initStorage();
  const storageKey = getCurrentUserStorageKey(userKey);

  await db.put(STORE_NAME, {
    calibrationSamples: samples,
    sampleCount: samples.length,
    rounds,
    savedAt: Date.now(),
  }, storageKey);
}

export async function getCalibrationSamplesLocally(userKey?: string): Promise<CalibrationSample[]> {
  const current = await getCalibrationLocally(userKey);
  return current?.calibrationSamples ?? [];
}

export async function getCalibrationLocally(userKey?: string): Promise<StoredCalibration | undefined> {
  const db = await initStorage();
  const storageKey = getCurrentUserStorageKey(userKey);
  return db.get(STORE_NAME, storageKey) as Promise<StoredCalibration | undefined>;
}

export async function resetCalibrationLocally(userKey?: string) {
  const db = await initStorage();
  const storageKey = getCurrentUserStorageKey(userKey);
  await db.delete(STORE_NAME, storageKey);
}
