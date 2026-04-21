const GAZE_WEIGHTS_UPDATED_AT_KEY = 'gaze:weights:updatedAt';

export const GAZE_WEIGHTS_UPDATED_EVENT = 'gaze:weights-updated';

export function markGazeWeightsUpdated(at: number = Date.now()): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(GAZE_WEIGHTS_UPDATED_AT_KEY, String(at));
  window.dispatchEvent(new CustomEvent(GAZE_WEIGHTS_UPDATED_EVENT, { detail: { at } }));
}

export function getLastGazeWeightsUpdateAt(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(GAZE_WEIGHTS_UPDATED_AT_KEY);
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}