/**
 * Low-level WebAssembly binding for gaze-core crate.
 * Wraps C ABI exported functions and handles memory buffers.
 */

export interface WasmCalibrationMetrics {
  maeX: number;
  maeY: number;
  mae2D: number;
  r2X: number;
  r2Y: number;
  inlierRatio: number;
  inlierMae2D: number;
}

export interface WasmFrameOutput {
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

interface WasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  gaze_get_input_buffer_ptr: () => number;
  gaze_get_output_buffer_ptr: () => number;
  gaze_get_weights_buffer_ptr: () => number;
  gaze_get_metrics_buffer_ptr: () => number;
  gaze_engine_create: (width: number, height: number) => number;
  gaze_engine_destroy: (ptr: number) => void;
  gaze_engine_process_frame: (ptr: number, timestampMs: number, dtSec: number) => number;
  gaze_engine_add_calibration_sample: (ptr: number, tx: number, ty: number) => number;
  gaze_engine_add_calibration_feature18: (ptr: number, tx: number, ty: number) => number;
  gaze_engine_add_calibration_feature7: (
    ptr: number,
    lx: number,
    ly: number,
    rx: number,
    ry: number,
    pitch: number,
    yaw: number,
    roll: number,
    tx: number,
    ty: number,
  ) => number;
  gaze_engine_calibrate_and_export: (ptr: number) => number;
  gaze_engine_import_weights: (ptr: number) => number;
  gaze_engine_clear_calibration: (ptr: number) => void;
  gaze_engine_add_drift_sample: (
    ptr: number,
    predX: number,
    predY: number,
    targetX: number,
    targetY: number,
    weight: number,
  ) => void;
  gaze_engine_add_target: (
    ptr: number,
    id: number,
    x: number,
    y: number,
    w: number,
    h: number,
    gravityRadius: number,
  ) => number;
  gaze_engine_clear_targets: (ptr: number) => void;
  gaze_engine_set_ear_baseline: (ptr: number, baselineEar: number, dominantEyeCode: number) => void;
  gaze_engine_set_screen_size: (ptr: number, w: number, h: number) => void;
  gaze_engine_set_pursuit_target: (
    ptr: number,
    cx: number,
    cy: number,
    radius: number,
    periodMs: number,
  ) => void;
}

let wasmExports: WasmExports | null = null;
let initPromise: Promise<WasmExports> | null = null;

export async function loadGazeCoreWasm(
  customSource?: string | ArrayBuffer | Response,
): Promise<WasmExports> {
  if (wasmExports) return wasmExports;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let source: Response | ArrayBuffer;
    if (customSource instanceof ArrayBuffer) {
      source = customSource;
    } else if (customSource instanceof Response) {
      source = customSource;
    } else {
      const url = typeof customSource === 'string' ? customSource : '/wasm/gaze_core.wasm';
      source = await fetch(url);
    }

    let instance: WebAssembly.Instance;
    if (source instanceof ArrayBuffer) {
      const wasmMod = await WebAssembly.instantiate(source, {});
      instance = wasmMod.instance;
    } else if (typeof WebAssembly.instantiateStreaming === 'function') {
      try {
        const res = await WebAssembly.instantiateStreaming(source, {});
        instance = res.instance;
      } catch {
        // Fallback to arrayBuffer if mime type or streaming fails
        const buffer = await (source as Response).arrayBuffer();
        const res = await WebAssembly.instantiate(buffer, {});
        instance = res.instance;
      }
    } else {
      const buffer = await (source as Response).arrayBuffer();
      const res = await WebAssembly.instantiate(buffer, {});
      instance = res.instance;
    }

    wasmExports = instance.exports as unknown as WasmExports;
    return wasmExports;
  })();

  return initPromise;
}

export class WasmGazeEngine {
  private exports: WasmExports;
  private enginePtr: number;

  constructor(exports: WasmExports, screenWidth = 1920, screenHeight = 1080) {
    this.exports = exports;
    this.enginePtr = exports.gaze_engine_create(screenWidth, screenHeight);
    if (!this.enginePtr) {
      throw new Error('Failed to create native WasmGazeEngine pointer');
    }
  }

  get rawEnginePtr(): number {
    return this.enginePtr;
  }

  private getFloat64View(byteOffset: number, length: number): Float64Array {
    return new Float64Array(this.exports.memory.buffer, byteOffset, length);
  }

  setInputLandmarks(landmarks33: ArrayLike<number>): void {
    const ptr = this.exports.gaze_get_input_buffer_ptr();
    const view = this.getFloat64View(ptr, 33);
    for (let i = 0; i < 33; i++) {
      view[i] = landmarks33[i] ?? 0;
    }
  }

  processFrame(timestampMs: number, dtSec: number): WasmFrameOutput {
    const code = this.exports.gaze_engine_process_frame(this.enginePtr, timestampMs, dtSec);
    const outPtr = this.exports.gaze_get_output_buffer_ptr();
    const out = this.getFloat64View(outPtr, 16);

    return {
      rawX: out[0],
      rawY: out[1],
      driftX: out[2],
      driftY: out[3],
      filteredX: out[4],
      filteredY: out[5],
      smoothX: out[6],
      smoothY: out[7],
      snappedX: out[8],
      snappedY: out[9],
      activeTargetId: Math.round(out[10]),
      blinkEventCode: Math.round(out[11]),
      blinkDurationMs: out[12],
      saccadeEventCode: Math.round(out[13]),
      pursuitProgress: out[14],
      isValid: code === 1 && out[15] > 0.5,
    };
  }

  copyOutputRaw(dest: Float64Array): void {
    const outPtr = this.exports.gaze_get_output_buffer_ptr();
    const src = this.getFloat64View(outPtr, 16);
    dest.set(src);
  }

  addCalibrationSample(targetX: number, targetY: number): boolean {
    return this.exports.gaze_engine_add_calibration_sample(this.enginePtr, targetX, targetY) === 1;
  }

  addCalibrationFeature18(targetX: number, targetY: number): boolean {
    return (
      this.exports.gaze_engine_add_calibration_feature18(this.enginePtr, targetX, targetY) === 1
    );
  }

  addCalibrationFeature7(
    lx: number,
    ly: number,
    rx: number,
    ry: number,
    pitch: number,
    yaw: number,
    roll: number,
    targetX: number,
    targetY: number,
  ): boolean {
    return (
      this.exports.gaze_engine_add_calibration_feature7(
        this.enginePtr,
        lx,
        ly,
        rx,
        ry,
        pitch,
        yaw,
        roll,
        targetX,
        targetY,
      ) === 1
    );
  }

  calibrateAndExport(): { metrics: WasmCalibrationMetrics; coeffsX: number[]; coeffsY: number[] } | null {
    const ok = this.exports.gaze_engine_calibrate_and_export(this.enginePtr) === 1;
    if (!ok) return null;

    const mPtr = this.exports.gaze_get_metrics_buffer_ptr();
    const m = this.getFloat64View(mPtr, 7);
    const metrics: WasmCalibrationMetrics = {
      maeX: m[0],
      maeY: m[1],
      mae2D: m[2],
      r2X: m[3],
      r2Y: m[4],
      inlierRatio: m[5],
      inlierMae2D: m[6],
    };

    const wPtr = this.exports.gaze_get_weights_buffer_ptr();
    const w = this.getFloat64View(wPtr, 36);
    const coeffsX = Array.from(w.subarray(0, 18));
    const coeffsY = Array.from(w.subarray(18, 36));

    return { metrics, coeffsX, coeffsY };
  }

  importWeights(coeffsX: ArrayLike<number>, coeffsY: ArrayLike<number>): boolean {
    const wPtr = this.exports.gaze_get_weights_buffer_ptr();
    const w = this.getFloat64View(wPtr, 36);
    for (let i = 0; i < 18; i++) {
      w[i] = coeffsX[i] ?? 0;
      w[18 + i] = coeffsY[i] ?? 0;
    }
    return this.exports.gaze_engine_import_weights(this.enginePtr) === 1;
  }

  clearCalibration(): void {
    this.exports.gaze_engine_clear_calibration(this.enginePtr);
  }

  addDriftSample(
    predX: number,
    predY: number,
    targetX: number,
    targetY: number,
    weight = 1.0,
  ): void {
    this.exports.gaze_engine_add_drift_sample(
      this.enginePtr,
      predX,
      predY,
      targetX,
      targetY,
      weight,
    );
  }

  addTarget(
    id: number,
    x: number,
    y: number,
    w: number,
    h: number,
    gravityRadius = 60.0,
  ): boolean {
    return (
      this.exports.gaze_engine_add_target(this.enginePtr, id, x, y, w, h, gravityRadius) === 1
    );
  }

  clearTargets(): void {
    this.exports.gaze_engine_clear_targets(this.enginePtr);
  }

  setEarBaseline(baselineEar: number, dominantEyeCode: 0 | 1 | 2 = 0): void {
    this.exports.gaze_engine_set_ear_baseline(this.enginePtr, baselineEar, dominantEyeCode);
  }

  setScreenSize(width: number, height: number): void {
    this.exports.gaze_engine_set_screen_size(this.enginePtr, width, height);
  }

  setPursuitTarget(
    cx: number,
    cy: number,
    radius = 40.0,
    periodMs = 1200.0,
  ): void {
    this.exports.gaze_engine_set_pursuit_target(this.enginePtr, cx, cy, radius, periodMs);
  }

  destroy(): void {
    if (this.enginePtr) {
      this.exports.gaze_engine_destroy(this.enginePtr);
      this.enginePtr = 0;
    }
  }
}
