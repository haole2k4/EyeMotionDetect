//! `gaze-core`
//!
//! High-performance, zero-external-dependency mathematical core for real-time
//! gaze tracking, robust calibration, temporal jitter filtering, and hands-free
//! intentional interaction gestures (Blink, Saccade, Smooth Pursuit).
//!
//! Provides both clean ergonomic Rust APIs and zero-copy `#[no_mangle] pub extern "C"`
//! bindings for lightweight WebAssembly targets (`wasm32-unknown-unknown`).

pub mod calibration;
pub mod features;
pub mod filters;
pub mod gestures;

use calibration::{CalibrationMetrics, HuberRidgeCalibrator, ImplicitDriftCorrector};
use features::{
    build_feature_vector_18d, compute_face_center, compute_iod, expand_7d_to_18d,
    extract_anatomical_iris_coords, FeatureVector18D, RawEyeLandmarks, SimpleKalman1D,
};
use filters::{MagneticTargetSnap, OneEuroFilter2D, SpringInterpolator2D, TargetRect};
use gestures::{
    BlinkEvent, DominantEye, PitchCompensatedEarDetector, SaccadeEvent, SaccadicStrokeDetector,
    SmoothPursuitDetector,
};

/// Result of processing a single video frame through the gaze pipeline.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GazeFrameResult {
    /// Raw uncalibrated or raw regression gaze screen coordinates
    pub raw_x: f64,
    pub raw_y: f64,
    /// Gaze coordinates after implicit drift correction
    pub drift_corrected_x: f64,
    pub drift_corrected_y: f64,
    /// 1€ filtered coordinates
    pub filtered_x: f64,
    pub filtered_y: f64,
    /// Critically damped spring animated coordinates
    pub smooth_x: f64,
    pub smooth_y: f64,
    /// Magnetically snapped coordinates (locked to UI buttons)
    pub snapped_x: f64,
    pub snapped_y: f64,
    /// Active snapped target element ID, if any
    pub active_target_id: Option<i32>,
    /// Normalized iris eye coordinates (lx, ly, rx, ry)
    pub eye_coords: (f64, f64, f64, f64),
    /// Detected blink gesture event
    pub blink_event: BlinkEvent,
    /// Detected horizontal saccadic flick event
    pub saccade_event: SaccadeEvent,
    /// Smooth pursuit progress in [0.0, 1.0]
    pub pursuit_progress: f64,
    /// Smooth pursuit action confirmation
    pub pursuit_confirmed: bool,
    /// Whether gaze tracking was successfully computed
    pub is_valid: bool,
}

impl Default for GazeFrameResult {
    fn default() -> Self {
        Self {
            raw_x: 0.0,
            raw_y: 0.0,
            drift_corrected_x: 0.0,
            drift_corrected_y: 0.0,
            filtered_x: 0.0,
            filtered_y: 0.0,
            smooth_x: 0.0,
            smooth_y: 0.0,
            snapped_x: 0.0,
            snapped_y: 0.0,
            active_target_id: None,
            eye_coords: (0.5, 0.5, 0.5, 0.5),
            blink_event: BlinkEvent::None,
            saccade_event: SaccadeEvent::None,
            pursuit_progress: 0.0,
            pursuit_confirmed: false,
            is_valid: false,
        }
    }
}

/// Integrated real-time gaze pipeline engine.
pub struct GazePipelineEngine {
    pub screen_width: f64,
    pub screen_height: f64,
    // Kalman filters for smoothing the 4 anatomical coordinates
    pub kalman_lx: SimpleKalman1D,
    pub kalman_ly: SimpleKalman1D,
    pub kalman_rx: SimpleKalman1D,
    pub kalman_ry: SimpleKalman1D,
    // Regression calibrator
    pub calibrator: HuberRidgeCalibrator,
    pub calibration_samples: Vec<(FeatureVector18D, (f64, f64))>,
    // Drift corrector
    pub drift_corrector: ImplicitDriftCorrector,
    // Filters
    pub one_euro: OneEuroFilter2D,
    pub spring: SpringInterpolator2D,
    pub magnetic_snap: MagneticTargetSnap,
    // Gesture detectors
    pub ear_detector: PitchCompensatedEarDetector,
    pub saccade_detector: SaccadicStrokeDetector,
    pub pursuit_detector: SmoothPursuitDetector,
}

impl GazePipelineEngine {
    /// Creates a new pipeline instance configured for given screen resolution.
    pub fn new(screen_width: f64, screen_height: f64) -> Self {
        Self {
            screen_width,
            screen_height,
            kalman_lx: SimpleKalman1D::new(0.5),
            kalman_ly: SimpleKalman1D::new(0.5),
            kalman_rx: SimpleKalman1D::new(0.5),
            kalman_ry: SimpleKalman1D::new(0.5),
            calibrator: HuberRidgeCalibrator::default(),
            calibration_samples: Vec::with_capacity(256),
            drift_corrector: ImplicitDriftCorrector::new(),
            one_euro: OneEuroFilter2D::default(),
            spring: SpringInterpolator2D::new(),
            magnetic_snap: MagneticTargetSnap::new(),
            ear_detector: PitchCompensatedEarDetector::default(),
            saccade_detector: SaccadicStrokeDetector::new(),
            pursuit_detector: SmoothPursuitDetector::new(
                screen_width * 0.5,
                screen_height * 0.5,
                40.0,
                1200.0,
            ),
        }
    }

    /// Appends a training sample to calibration buffer.
    pub fn add_calibration_sample(
        &mut self,
        landmarks: &RawEyeLandmarks,
        target_x: f64,
        target_y: f64,
    ) -> bool {
        if let Some((lx, ly, rx, ry)) = extract_anatomical_iris_coords(landmarks) {
            let iod = compute_iod(landmarks.left_inner, landmarks.right_inner);
            let (fx, fy) = compute_face_center(
                landmarks.left_inner,
                landmarks.left_outer,
                landmarks.right_inner,
                landmarks.right_outer,
            );
            let feat = build_feature_vector_18d(
                lx,
                ly,
                rx,
                ry,
                landmarks.pitch,
                landmarks.yaw,
                landmarks.roll,
                iod,
                fx,
                fy,
            );
            self.calibration_samples.push((feat, (target_x, target_y)));
            true
        } else {
            false
        }
    }

    /// Fits the calibrator on gathered samples.
    pub fn finish_calibration(&mut self) -> Result<CalibrationMetrics, &'static str> {
        let metrics = self.calibrator.calibrate(&self.calibration_samples)?;
        self.drift_corrector.reset();
        Ok(metrics)
    }

    /// Clears calibration samples.
    pub fn clear_calibration(&mut self) {
        self.calibration_samples.clear();
        self.calibrator.is_calibrated = false;
        self.drift_corrector.reset();
    }

    /// Processes an incoming frame of landmarks.
    pub fn process_frame(
        &mut self,
        landmarks: &RawEyeLandmarks,
        timestamp_ms: f64,
        dt_sec: f64,
    ) -> GazeFrameResult {
        let Some((raw_lx, raw_ly, raw_rx, raw_ry)) = extract_anatomical_iris_coords(landmarks) else {
            return GazeFrameResult::default();
        };

        // 1D Kalman smoothing on anatomical coordinates
        let lx = self.kalman_lx.step(raw_lx, dt_sec);
        let ly = self.kalman_ly.step(raw_ly, dt_sec);
        let rx = self.kalman_rx.step(raw_rx, dt_sec);
        let ry = self.kalman_ry.step(raw_ry, dt_sec);

        let iod = compute_iod(landmarks.left_inner, landmarks.right_inner);
        let (fx, fy) = compute_face_center(
            landmarks.left_inner,
            landmarks.left_outer,
            landmarks.right_inner,
            landmarks.right_outer,
        );

        let feat = build_feature_vector_18d(
            lx,
            ly,
            rx,
            ry,
            landmarks.pitch,
            landmarks.yaw,
            landmarks.roll,
            iod,
            fx,
            fy,
        );

        // Gaze prediction
        let (pred_x, pred_y) = if self.calibrator.is_calibrated {
            self.calibrator.predict(&feat)
        } else {
            // Default linear heuristic if uncalibrated
            let avg_x = 0.5 * (lx + rx);
            let avg_y = 0.5 * (ly + ry);
            (avg_x * self.screen_width, avg_y * self.screen_height)
        };

        // Drift correction
        let (drift_x, drift_y) = self.drift_corrector.correct(pred_x, pred_y);

        // 1€ filtering
        let (filt_x, filt_y) = self.one_euro.filter(drift_x, drift_y, dt_sec);

        // 144Hz Critically-damped Spring interpolation
        let (smooth_x, smooth_y) = self.spring.update(filt_x, filt_y, dt_sec);

        // Magnetic UI snapping
        let (snapped_x, snapped_y, active_id) = self.magnetic_snap.snap(smooth_x, smooth_y);

        // Gestures
        let avg_norm_x = (0.5 * (lx + rx)).clamp(0.0, 1.0);
        let avg_norm_y = (0.5 * (ly + ry)).clamp(0.0, 1.0);

        let blink = self.ear_detector.update(
            landmarks.ear_left,
            landmarks.ear_right,
            avg_norm_y,
            timestamp_ms,
        );
        let saccade = self
            .saccade_detector
            .update(avg_norm_x, avg_norm_y, timestamp_ms);
        let (pursuit_prog, pursuit_conf, _) =
            self.pursuit_detector.update(smooth_x, smooth_y, timestamp_ms);

        GazeFrameResult {
            raw_x: pred_x,
            raw_y: pred_y,
            drift_corrected_x: drift_x,
            drift_corrected_y: drift_y,
            filtered_x: filt_x,
            filtered_y: filt_y,
            smooth_x,
            smooth_y,
            snapped_x,
            snapped_y,
            active_target_id: active_id,
            eye_coords: (lx, ly, rx, ry),
            blink_event: blink,
            saccade_event: saccade,
            pursuit_progress: pursuit_prog,
            pursuit_confirmed: pursuit_conf,
            is_valid: true,
        }
    }
}

// ============================================================================
// WebAssembly C ABI (Zero-copy flat memory interface)
// ============================================================================

use std::ptr::addr_of_mut;

/// Static input buffer for 33 landmark elements:
/// [0..8]: 4 canthus landmarks (left_inner x,y, left_outer x,y, right_inner x,y, right_outer x,y)
/// [8..18]: 5 left iris landmarks (x,y)
/// [18..28]: 5 right iris landmarks (x,y)
/// [28]: ear_left
/// [29]: ear_right
/// [30]: pitch
/// [31]: yaw
/// [32]: roll
static mut INPUT_LANDMARK_BUFFER: [f64; 33] = [0.0; 33];

/// Static output buffer for 16 prediction elements:
/// [0]: raw_x
/// [1]: raw_y
/// [2]: drift_x
/// [3]: drift_y
/// [4]: filtered_x
/// [5]: filtered_y
/// [6]: smooth_x
/// [7]: smooth_y
/// [8]: snapped_x
/// [9]: snapped_y
/// [10]: active_target_id (-1 if None)
/// [11]: blink_event (0 = None, 1 = ShortBlink, 2 = DwellConfirm)
/// [12]: blink_duration_ms
/// [13]: saccade_event (0 = None, 1 = SaccadeNext, 2 = SaccadePrev)
/// [14]: pursuit_progress (0.0 .. 1.0)
/// [15]: is_valid (1.0 if valid, 0.0 otherwise)
static mut OUTPUT_PRED_BUFFER: [f64; 16] = [0.0; 16];
/// Static buffer for 36 regression weights (coeffs_x[0..18] followed by coeffs_y[0..18]).
static mut WEIGHTS_BUFFER: [f64; 36] = [0.0; 36];
/// Static buffer for 7 calibration metrics.
static mut METRICS_BUFFER: [f64; 7] = [0.0; 7];

#[no_mangle]
pub extern "C" fn gaze_get_input_buffer_ptr() -> *mut f64 {
    addr_of_mut!(INPUT_LANDMARK_BUFFER) as *mut f64
}

#[no_mangle]
pub extern "C" fn gaze_get_output_buffer_ptr() -> *const f64 {
    addr_of_mut!(OUTPUT_PRED_BUFFER) as *const f64
}

#[no_mangle]
pub extern "C" fn gaze_get_weights_buffer_ptr() -> *mut f64 {
    addr_of_mut!(WEIGHTS_BUFFER) as *mut f64
}

#[no_mangle]
pub extern "C" fn gaze_get_metrics_buffer_ptr() -> *const f64 {
    addr_of_mut!(METRICS_BUFFER) as *const f64
}

#[no_mangle]
pub extern "C" fn gaze_engine_create(screen_width: f64, screen_height: f64) -> *mut GazePipelineEngine {
    let engine = Box::new(GazePipelineEngine::new(screen_width, screen_height));
    Box::into_raw(engine)
}

#[no_mangle]
pub extern "C" fn gaze_engine_destroy(engine: *mut GazePipelineEngine) {
    if !engine.is_null() {
        unsafe {
            drop(Box::from_raw(engine));
        }
    }
}

#[inline(always)]
unsafe fn parse_input_landmarks() -> RawEyeLandmarks {
    let ptr = addr_of_mut!(INPUT_LANDMARK_BUFFER) as *const f64;
    let get = |idx: usize| *ptr.add(idx);
    RawEyeLandmarks {
        left_inner: (get(0), get(1)),
        left_outer: (get(2), get(3)),
        right_inner: (get(4), get(5)),
        right_outer: (get(6), get(7)),
        left_iris: [
            (get(8), get(9)),
            (get(10), get(11)),
            (get(12), get(13)),
            (get(14), get(15)),
            (get(16), get(17)),
        ],
        right_iris: [
            (get(18), get(19)),
            (get(20), get(21)),
            (get(22), get(23)),
            (get(24), get(25)),
            (get(26), get(27)),
        ],
        ear_left: get(28),
        ear_right: get(29),
        matrix_4x4: None,
        pitch: get(30),
        yaw: get(31),
        roll: get(32),
    }
}

#[no_mangle]
pub extern "C" fn gaze_engine_process_frame(
    engine: *mut GazePipelineEngine,
    timestamp_ms: f64,
    dt_sec: f64,
) -> i32 {
    if engine.is_null() {
        return -1;
    }
    let eng = unsafe { &mut *engine };
    let landmarks = unsafe { parse_input_landmarks() };

    let res = eng.process_frame(&landmarks, timestamp_ms, dt_sec);

    let (blink_code, blink_dur) = match res.blink_event {
        BlinkEvent::None => (0.0, 0.0),
        BlinkEvent::ShortBlink { duration_ms, .. } => (1.0, duration_ms),
        BlinkEvent::DwellConfirm { duration_ms } => (2.0, duration_ms),
    };

    let saccade_code = match res.saccade_event {
        SaccadeEvent::None => 0.0,
        SaccadeEvent::SaccadeNext => 1.0,
        SaccadeEvent::SaccadePrev => 2.0,
    };

    let target_id_code = res.active_target_id.map(|id| id as f64).unwrap_or(-1.0);

    unsafe {
        let out = addr_of_mut!(OUTPUT_PRED_BUFFER) as *mut f64;
        *out.add(0) = res.raw_x;
        *out.add(1) = res.raw_y;
        *out.add(2) = res.drift_corrected_x;
        *out.add(3) = res.drift_corrected_y;
        *out.add(4) = res.filtered_x;
        *out.add(5) = res.filtered_y;
        *out.add(6) = res.smooth_x;
        *out.add(7) = res.smooth_y;
        *out.add(8) = res.snapped_x;
        *out.add(9) = res.snapped_y;
        *out.add(10) = target_id_code;
        *out.add(11) = blink_code;
        *out.add(12) = blink_dur;
        *out.add(13) = saccade_code;
        *out.add(14) = res.pursuit_progress;
        *out.add(15) = if res.is_valid { 1.0 } else { 0.0 };
    }

    if res.is_valid {
        1
    } else {
        0
    }
}

#[no_mangle]
pub extern "C" fn gaze_engine_add_calibration_sample(
    engine: *mut GazePipelineEngine,
    target_x: f64,
    target_y: f64,
) -> i32 {
    if engine.is_null() {
        return -1;
    }
    let eng = unsafe { &mut *engine };
    let landmarks = unsafe { parse_input_landmarks() };
    if eng.add_calibration_sample(&landmarks, target_x, target_y) {
        1
    } else {
        0
    }
}

#[no_mangle]
pub extern "C" fn gaze_engine_finish_calibration(
    engine: *mut GazePipelineEngine,
    out_metrics: *mut f64,
) -> i32 {
    if engine.is_null() {
        return -1;
    }
    let eng = unsafe { &mut *engine };
    match eng.finish_calibration() {
        Ok(m) => {
            if !out_metrics.is_null() {
                unsafe {
                    *out_metrics.add(0) = m.mae_x;
                    *out_metrics.add(1) = m.mae_y;
                    *out_metrics.add(2) = m.mae_2d;
                    *out_metrics.add(3) = m.r2_x;
                    *out_metrics.add(4) = m.r2_y;
                    *out_metrics.add(5) = m.inlier_ratio;
                    *out_metrics.add(6) = m.inlier_mae_2d;
                }
            }
            1
        }
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "C" fn gaze_engine_add_drift_sample(
    engine: *mut GazePipelineEngine,
    pred_x: f64,
    pred_y: f64,
    target_x: f64,
    target_y: f64,
    weight: f64,
) {
    if !engine.is_null() {
        let eng = unsafe { &mut *engine };
        eng.drift_corrector.add_sample(pred_x, pred_y, target_x, target_y, weight);
    }
}

#[no_mangle]
pub extern "C" fn gaze_engine_add_target(
    engine: *mut GazePipelineEngine,
    id: i32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    gravity_radius: f64,
) -> i32 {
    if engine.is_null() {
        return -1;
    }
    let eng = unsafe { &mut *engine };
    let target = TargetRect {
        id,
        x,
        y,
        width,
        height,
        gravity_radius,
    };
    if eng.magnetic_snap.add_target(target) {
        1
    } else {
        0
    }
}

#[no_mangle]
pub extern "C" fn gaze_engine_clear_targets(engine: *mut GazePipelineEngine) {
    if !engine.is_null() {
        let eng = unsafe { &mut *engine };
        eng.magnetic_snap.clear();
    }
}

#[no_mangle]
pub extern "C" fn gaze_engine_set_ear_baseline(
    engine: *mut GazePipelineEngine,
    baseline_ear: f64,
    dominant_eye: u8,
) {
    if !engine.is_null() {
        let eng = unsafe { &mut *engine };
        eng.ear_detector.baseline_ear = baseline_ear;
        eng.ear_detector.dominant_eye = match dominant_eye {
            1 => DominantEye::LeftOnly,
            2 => DominantEye::RightOnly,
            _ => DominantEye::Both,
        };
    }
}

#[no_mangle]
pub extern "C" fn gaze_engine_set_screen_size(
    engine: *mut GazePipelineEngine,
    screen_width: f64,
    screen_height: f64,
) {
    if !engine.is_null() {
        let eng = unsafe { &mut *engine };
        eng.screen_width = screen_width;
        eng.screen_height = screen_height;
    }
}

#[no_mangle]
pub extern "C" fn gaze_engine_clear_calibration(engine: *mut GazePipelineEngine) {
    if !engine.is_null() {
        let eng = unsafe { &mut *engine };
        eng.clear_calibration();
    }
}

#[no_mangle]
pub extern "C" fn gaze_engine_add_calibration_feature18(
    engine: *mut GazePipelineEngine,
    target_x: f64,
    target_y: f64,
) -> i32 {
    if engine.is_null() {
        return -1;
    }
    let eng = unsafe { &mut *engine };
    let ptr = addr_of_mut!(INPUT_LANDMARK_BUFFER) as *const f64;
    let mut feat = [0.0; 18];
    unsafe {
        for i in 0..18 {
            feat[i] = *ptr.add(i);
        }
    }
    eng.calibration_samples.push((feat, (target_x, target_y)));
    1
}

#[no_mangle]
pub extern "C" fn gaze_engine_add_calibration_feature7(
    engine: *mut GazePipelineEngine,
    lx: f64,
    ly: f64,
    rx: f64,
    ry: f64,
    pitch: f64,
    yaw: f64,
    roll: f64,
    target_x: f64,
    target_y: f64,
) -> i32 {
    if engine.is_null() {
        return -1;
    }
    let eng = unsafe { &mut *engine };
    let f7 = [lx, ly, rx, ry, pitch, yaw, roll];
    let feat = expand_7d_to_18d(&f7);
    eng.calibration_samples.push((feat, (target_x, target_y)));
    1
}

#[no_mangle]
pub extern "C" fn gaze_engine_calibrate_and_export(engine: *mut GazePipelineEngine) -> i32 {
    if engine.is_null() {
        return -1;
    }
    let eng = unsafe { &mut *engine };
    match eng.finish_calibration() {
        Ok(m) => {
            unsafe {
                let m_ptr = addr_of_mut!(METRICS_BUFFER) as *mut f64;
                *m_ptr.add(0) = m.mae_x;
                *m_ptr.add(1) = m.mae_y;
                *m_ptr.add(2) = m.mae_2d;
                *m_ptr.add(3) = m.r2_x;
                *m_ptr.add(4) = m.r2_y;
                *m_ptr.add(5) = m.inlier_ratio;
                *m_ptr.add(6) = m.inlier_mae_2d;

                let w_ptr = addr_of_mut!(WEIGHTS_BUFFER) as *mut f64;
                for i in 0..18 {
                    *w_ptr.add(i) = eng.calibrator.coeffs_x[i];
                    *w_ptr.add(18 + i) = eng.calibrator.coeffs_y[i];
                }
            }
            1
        }
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "C" fn gaze_engine_import_weights(engine: *mut GazePipelineEngine) -> i32 {
    if engine.is_null() {
        return -1;
    }
    let eng = unsafe { &mut *engine };
    unsafe {
        let w_ptr = addr_of_mut!(WEIGHTS_BUFFER) as *const f64;
        for i in 0..18 {
            eng.calibrator.coeffs_x[i] = *w_ptr.add(i);
            eng.calibrator.coeffs_y[i] = *w_ptr.add(18 + i);
        }
    }
    eng.calibrator.is_calibrated = true;
    1
}

#[no_mangle]
pub extern "C" fn gaze_engine_set_pursuit_target(
    engine: *mut GazePipelineEngine,
    center_x: f64,
    center_y: f64,
    radius: f64,
    period_ms: f64,
) {
    if !engine.is_null() {
        let eng = unsafe { &mut *engine };
        eng.pursuit_detector.center = (center_x, center_y);
        eng.pursuit_detector.radius = radius.max(10.0);
        eng.pursuit_detector.period_ms = period_ms.max(400.0);
        eng.pursuit_detector.reset();
    }
}

// ============================================================================
// Comprehensive Unit Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipeline_end_to_end() {
        let mut engine = GazePipelineEngine::new(1920.0, 1080.0);

        // Register button A at (200, 200), w=200, h=80, gravity=60
        engine.magnetic_snap.add_target(TargetRect {
            id: 101,
            x: 200.0,
            y: 200.0,
            width: 200.0,
            height: 80.0,
            gravity_radius: 60.0,
        });

        let mut landmarks = RawEyeLandmarks::default();
        landmarks.left_inner = (0.45, 0.50);
        landmarks.left_outer = (0.35, 0.50);
        landmarks.right_inner = (0.55, 0.50);
        landmarks.right_outer = (0.65, 0.50);

        // Center irises
        landmarks.left_iris = [(0.40, 0.50); 5];
        landmarks.right_iris = [(0.60, 0.50); 5];

        let res = engine.process_frame(&landmarks, 100.0, 0.016);
        assert!(res.is_valid);
        assert!((res.smooth_x - 960.0).abs() < 100.0);
        assert!((res.smooth_y - 540.0).abs() < 100.0);
    }

    #[test]
    fn test_c_abi_buffer_roundtrip() {
        let engine_ptr = gaze_engine_create(1920.0, 1080.0);
        assert!(!engine_ptr.is_null());

        let in_buf = gaze_get_input_buffer_ptr();
        assert!(!in_buf.is_null());

        unsafe {
            // Set landmarks
            *in_buf.add(0) = 0.45; // left_inner x
            *in_buf.add(1) = 0.50; // left_inner y
            *in_buf.add(2) = 0.35; // left_outer x
            *in_buf.add(3) = 0.50; // left_outer y
            *in_buf.add(4) = 0.55; // right_inner x
            *in_buf.add(5) = 0.50; // right_inner y
            *in_buf.add(6) = 0.65; // right_outer x
            *in_buf.add(7) = 0.50; // right_outer y

            for i in 0..5 {
                *in_buf.add(8 + i * 2) = 0.40;
                *in_buf.add(9 + i * 2) = 0.50;
                *in_buf.add(18 + i * 2) = 0.60;
                *in_buf.add(19 + i * 2) = 0.50;
            }

            *in_buf.add(28) = 0.30; // ear_left
            *in_buf.add(29) = 0.30; // ear_right
            *in_buf.add(30) = 0.0;  // pitch
            *in_buf.add(31) = 0.0;  // yaw
            *in_buf.add(32) = 0.0;  // roll
        }

        let ret = gaze_engine_process_frame(engine_ptr, 100.0, 0.016);
        assert_eq!(ret, 1);

        let out_buf = gaze_get_output_buffer_ptr();
        assert!(!out_buf.is_null());

        unsafe {
            let is_valid = *out_buf.add(15);
            assert_eq!(is_valid, 1.0);
        }

        gaze_engine_destroy(engine_ptr);
    }
}
