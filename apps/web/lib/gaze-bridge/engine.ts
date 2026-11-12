/**
 * Zero-copy SharedArrayBuffer bridge and optional WebSocket R&D client for gaze pipeline.
 */

export interface MagneticTargetSpec {
  id: number;
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  gravityRadius?: number;
}

export interface AccessibilityProfileConfig {
  dominantEye: 'both' | 'left' | 'right';
  triggerMode: 'blink' | 'dwell';
  dwellTimeMs: number;
  blinkDurationMs: number;
  ttsEnabled: boolean;
  magneticStrength: number;
}

export const DEFAULT_ACCESSIBILITY_PROFILE: AccessibilityProfileConfig = {
  dominantEye: 'both',
  triggerMode: 'blink',
  dwellTimeMs: 1200,
  blinkDurationMs: 350,
  ttsEnabled: true,
  magneticStrength: 1.0,
};

export interface GazeSnapshot {
  rawX: number;
  rawY: number;
  driftX: number;
  driftY: number;
  filteredX: number;
  filteredY: number;
  smoothX: number;
  smoothY: number;
  snappedX: number;
  snappedY: number;
  activeTargetId: number;
  blinkEventCode: number;
  blinkDurationMs: number;
  saccadeEventCode: number;
  pursuitProgress: number;
  isValid: boolean;
}

/**
 * Shared memory buffer of 16 f64 elements:
 * [0]: rawX, [1]: rawY
 * [2]: driftX, [3]: driftY
 * [4]: filteredX, [5]: filteredY
 * [6]: smoothX, [7]: smoothY
 * [8]: snappedX, [9]: snappedY
 * [10]: activeTargetId (-1 = none)
 * [11]: blinkEventCode (0 = none, 1 = short blink, 2 = dwell confirm)
 * [12]: blinkDurationMs
 * [13]: saccadeEventCode (0 = none, 1 = next, 2 = prev)
 * [14]: pursuitProgress (0.0 .. 1.0)
 * [15]: isValid (1.0 = true, 0.0 = false)
 */
export class SharedGazeBuffer {
  public readonly isShared: boolean;
  public readonly buffer: SharedArrayBuffer | ArrayBuffer;
  private readonly f64: Float64Array;

  constructor(existingBuffer?: SharedArrayBuffer | ArrayBuffer) {
    if (existingBuffer) {
      this.buffer = existingBuffer;
      this.isShared =
        typeof SharedArrayBuffer !== 'undefined' && existingBuffer instanceof SharedArrayBuffer;
      this.f64 = new Float64Array(this.buffer, 0, 16);
    } else {
      const canUseShared =
        typeof SharedArrayBuffer !== 'undefined' &&
        typeof globalThis !== 'undefined' &&
        Boolean((globalThis as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated);

      if (canUseShared) {
        this.buffer = new SharedArrayBuffer(16 * 8);
        this.isShared = true;
      } else {
        this.buffer = new ArrayBuffer(16 * 8);
        this.isShared = false;
      }
      this.f64 = new Float64Array(this.buffer, 0, 16);
    }
  }

  writeSnapshot(data: Partial<GazeSnapshot> | Float64Array | number[]): void {
    if (data instanceof Float64Array || Array.isArray(data)) {
      for (let i = 0; i < 16; i++) {
        this.f64[i] = data[i] ?? 0;
      }
      return;
    }

    const d = data as Partial<GazeSnapshot>;
    this.f64[0] = d.rawX ?? 0;
    this.f64[1] = d.rawY ?? 0;
    this.f64[2] = d.driftX ?? 0;
    this.f64[3] = d.driftY ?? 0;
    this.f64[4] = d.filteredX ?? 0;
    this.f64[5] = d.filteredY ?? 0;
    this.f64[6] = d.smoothX ?? 0;
    this.f64[7] = d.smoothY ?? 0;
    this.f64[8] = d.snappedX ?? 0;
    this.f64[9] = d.snappedY ?? 0;
    this.f64[10] = d.activeTargetId ?? -1;
    this.f64[11] = d.blinkEventCode ?? 0;
    this.f64[12] = d.blinkDurationMs ?? 0;
    this.f64[13] = d.saccadeEventCode ?? 0;
    this.f64[14] = d.pursuitProgress ?? 0;
    this.f64[15] = d.isValid ? 1.0 : 0.0;
  }

  readSnapshot(): GazeSnapshot {
    return {
      rawX: this.f64[0],
      rawY: this.f64[1],
      driftX: this.f64[2],
      driftY: this.f64[3],
      filteredX: this.f64[4],
      filteredY: this.f64[5],
      smoothX: this.f64[6],
      smoothY: this.f64[7],
      snappedX: this.f64[8],
      snappedY: this.f64[9],
      activeTargetId: Math.round(this.f64[10]),
      blinkEventCode: Math.round(this.f64[11]),
      blinkDurationMs: this.f64[12],
      saccadeEventCode: Math.round(this.f64[13]),
      pursuitProgress: this.f64[14],
      isValid: this.f64[15] > 0.5,
    };
  }

  getRawView(): Float64Array {
    return this.f64;
  }
}

export type WebSocketGazeCallback = (data: {
  rawX: number;
  rawY: number;
  smoothX: number;
  smoothY: number;
  snappedX?: number;
  snappedY?: number;
  targetId?: number;
  gesture?: 'blink' | 'saccade_next' | 'saccade_prev' | 'pursuit_confirm';
}) => void;

/**
 * Optional WebSocket client to connect to local python daemon (ws://127.0.0.1:8765)
 * for RTX 3050 deep model / benchmark R&D.
 */
export class WebSocketGazeClient {
  private url: string;
  private ws: WebSocket | null = null;
  private onGazeData: WebSocketGazeCallback | null = null;
  private shouldReconnect = true;
  private reconnectTimer: number | null = null;
  public isConnected = false;

  constructor(url = 'ws://127.0.0.1:8765') {
    this.url = url;
  }

  connect(onGazeData: WebSocketGazeCallback): void {
    if (typeof window === 'undefined') return;
    this.onGazeData = onGazeData;
    this.shouldReconnect = true;
    this.initSocket();
  }

  private initSocket(): void {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.isConnected = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (this.onGazeData && parsed.rawX !== undefined) {
            this.onGazeData(parsed);
          }
        } catch {
          // ignore malformed frame
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch {
      this.isConnected = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.initSocket();
      }
    }, 2500);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.onGazeData = null;
  }
}
