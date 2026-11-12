//! Feature extraction and landmark processing module.
//!
//! Provides zero-dependency anatomical eye frame extraction, 1D Kalman filtering
//! for iris noise reduction, and 18-dimensional hybrid feature vector construction.

/// 1D Kalman filter for smoothing noisy landmark coordinates while preserving rapid motion.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SimpleKalman1D {
    /// State estimate: position
    pub x: f64,
    /// State estimate: velocity
    pub v: f64,
    /// Covariance P[0][0] (position variance)
    pub p_xx: f64,
    /// Covariance P[0][1] (position-velocity covariance)
    pub p_xv: f64,
    /// Covariance P[1][0] (velocity-position covariance)
    pub p_vx: f64,
    /// Covariance P[1][1] (velocity variance)
    pub p_vv: f64,
    /// Process noise variance for position
    pub q_x: f64,
    /// Process noise variance for velocity
    pub q_v: f64,
    /// Measurement noise variance
    pub r: f64,
}

impl Default for SimpleKalman1D {
    fn default() -> Self {
        Self::new(0.0)
    }
}

impl SimpleKalman1D {
    /// Creates a new 1D Kalman filter initialized at `initial_x`.
    pub fn new(initial_x: f64) -> Self {
        Self {
            x: initial_x,
            v: 0.0,
            p_xx: 1.0,
            p_xv: 0.0,
            p_vx: 0.0,
            p_vv: 1.0,
            q_x: 0.001,
            q_v: 0.001,
            r: 0.008,
        }
    }

    /// Resets the filter state to a new initial position.
    pub fn reset(&mut self, initial_x: f64) {
        self.x = initial_x;
        self.v = 0.0;
        self.p_xx = 1.0;
        self.p_xv = 0.0;
        self.p_vx = 0.0;
        self.p_vv = 1.0;
    }

    /// Predicts state and covariance forward by `dt` seconds.
    pub fn predict(&mut self, dt: f64) {
        // State transition: x = x + v * dt; v = v
        self.x += self.v * dt;

        // Covariance update: P = F * P * F^T + Q
        // F = [[1, dt], [0, 1]]
        let dt2 = dt * dt;
        let new_p_xx = self.p_xx + dt * (self.p_vx + self.p_xv) + dt2 * self.p_vv + self.q_x;
        let new_p_xv = self.p_xv + dt * self.p_vv;
        let new_p_vx = self.p_vx + dt * self.p_vv;
        let new_p_vv = self.p_vv + self.q_v;

        self.p_xx = new_p_xx;
        self.p_xv = new_p_xv;
        self.p_vx = new_p_vx;
        self.p_vv = new_p_vv;
    }

    /// Updates state with a scalar measurement and returns the updated position.
    pub fn update(&mut self, measurement: f64) -> f64 {
        // Measurement matrix H = [1, 0]
        let innovation = measurement - self.x;
        let s = self.p_xx + self.r;

        if s.abs() > 1e-12 {
            let k_x = self.p_xx / s;
            let k_v = self.p_vx / s;

            self.x += k_x * innovation;
            self.v += k_v * innovation;

            let p_xx_temp = (1.0 - k_x) * self.p_xx;
            let p_xv_temp = (1.0 - k_x) * self.p_xv;
            let p_vx_temp = -k_v * self.p_xx + self.p_vx;
            let p_vv_temp = -k_v * self.p_xv + self.p_vv;

            // Enforce symmetry
            let sym_cov = 0.5 * (p_xv_temp + p_vx_temp);
            self.p_xx = p_xx_temp;
            self.p_xv = sym_cov;
            self.p_vx = sym_cov;
            self.p_vv = p_vv_temp;
        }

        self.x
    }

    /// Runs a combined predict and update step with time step `dt` (seconds).
    pub fn step(&mut self, measurement: f64, dt: f64) -> f64 {
        let valid_dt = if dt > 0.0001 && dt < 1.0 { dt } else { 0.016667 };
        self.predict(valid_dt);
        self.update(measurement)
    }
}

/// Raw facial and eye landmarks typically received from MediaPipe FaceMesh.
#[derive(Debug, Clone, PartialEq)]
pub struct RawEyeLandmarks {
    /// Left eye inner canthus landmark (#133)
    pub left_inner: (f64, f64),
    /// Left eye outer canthus landmark (#33)
    pub left_outer: (f64, f64),
    /// Right eye inner canthus landmark (#362)
    pub right_inner: (f64, f64),
    /// Right eye outer canthus landmark (#263)
    pub right_outer: (f64, f64),
    /// 5 Left eye iris contour landmarks (#468..=#472)
    pub left_iris: [(f64, f64); 5],
    /// 5 Right eye iris contour landmarks (#473..=#477)
    pub right_iris: [(f64, f64); 5],
    /// Eye Aspect Ratio (EAR) for left eye
    pub ear_left: f64,
    /// Eye Aspect Ratio (EAR) for right eye
    pub ear_right: f64,
    /// Optional 4x4 facial transformation matrix
    pub matrix_4x4: Option<[f64; 16]>,
    /// Head orientation: pitch (radians)
    pub pitch: f64,
    /// Head orientation: yaw (radians)
    pub yaw: f64,
    /// Head orientation: roll (radians)
    pub roll: f64,
}

impl Default for RawEyeLandmarks {
    fn default() -> Self {
        Self {
            left_inner: (0.45, 0.45),
            left_outer: (0.35, 0.45),
            right_inner: (0.55, 0.45),
            right_outer: (0.65, 0.45),
            left_iris: [(0.40, 0.45); 5],
            right_iris: [(0.60, 0.45); 5],
            ear_left: 0.30,
            ear_right: 0.30,
            matrix_4x4: None,
            pitch: 0.0,
            yaw: 0.0,
            roll: 0.0,
        }
    }
}

#[inline(always)]
fn clamp01(v: f64) -> f64 {
    if v < 0.0 {
        0.0
    } else if v > 1.0 {
        1.0
    } else {
        v
    }
}

/// Computes the centroid of 5 iris boundary landmarks.
#[inline(always)]
fn compute_iris_center(pts: &[(f64, f64); 5]) -> (f64, f64) {
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    for &(x, y) in pts {
        sum_x += x;
        sum_y += y;
    }
    (sum_x * 0.2, sum_y * 0.2)
}

/// Normalizes single eye iris coordinates into rotation-invariant anatomical eye coordinates.
///
/// Returns `Some((x_norm, y_norm))` where:
/// - `x_norm` in [0.0, 1.0] corresponds to horizontal gaze (left to right)
/// - `y_norm` in [0.0, 1.0] corresponds to vertical gaze (top to bottom)
///
/// Returns `None` if eye width is degenerate (< 1e-5), indicating occlusion.
pub fn extract_single_eye_coords(
    inner: (f64, f64),
    outer: (f64, f64),
    iris: &[(f64, f64); 5],
    is_right_eye: bool,
) -> Option<(f64, f64)> {
    let iris_center = compute_iris_center(iris);

    // Vector d from inner to outer canthus
    let d_x = outer.0 - inner.0;
    let d_y = outer.1 - inner.1;
    let w = (d_x * d_x + d_y * d_y).sqrt();

    if w < 1e-5 {
        return None;
    }

    // Unit horizontal vector along eye axis
    let u_x = d_x / w;
    let u_y = d_y / w;

    // Perpendicular vertical vector v = (-u_y, u_x)
    // Positive direction must point downward along the screen
    let mut v_x = -u_y;
    let mut v_y = u_x;
    if v_y < 0.0 {
        v_x = u_y;
        v_y = -u_x;
    }

    // Relative iris vector from inner canthus
    let rel_iris_x = iris_center.0 - inner.0;
    let rel_iris_y = iris_center.1 - inner.1;

    // Dot product with horizontal unit vector u
    let proj_u = (rel_iris_x * u_x + rel_iris_y * u_y) / w;
    let x_raw = clamp01(proj_u);

    // For right eye, invert horizontal axis so both eyes have identical left-to-right gaze direction
    let x_norm = if is_right_eye {
        1.0 - x_raw
    } else {
        x_raw
    };

    // Eye midpoint
    let mid_x = 0.5 * (inner.0 + outer.0);
    let mid_y = 0.5 * (inner.1 + outer.1);

    // Relative iris vector from midpoint
    let rel_mid_x = iris_center.0 - mid_x;
    let rel_mid_y = iris_center.1 - mid_y;

    // Vertical projection
    let proj_v = (rel_mid_x * v_x + rel_mid_y * v_y) / w;
    let y_norm = clamp01(0.5 + 3.0 * proj_v);

    Some((x_norm, y_norm))
}

/// Extracts anatomical rotation-invariant iris coordinates `(lx, ly, rx, ry)`.
///
/// Returns `None` if either eye is occluded or width is degenerate.
pub fn extract_anatomical_iris_coords(
    landmarks: &RawEyeLandmarks,
) -> Option<(f64, f64, f64, f64)> {
    let (lx, ly) = extract_single_eye_coords(
        landmarks.left_inner,
        landmarks.left_outer,
        &landmarks.left_iris,
        false,
    )?;

    let (rx, ry) = extract_single_eye_coords(
        landmarks.right_inner,
        landmarks.right_outer,
        &landmarks.right_iris,
        true,
    )?;

    Some((lx, ly, rx, ry))
}

/// Computes the interocular distance (IOD) in normalized screen space.
#[inline(always)]
pub fn compute_iod(left_inner: (f64, f64), right_inner: (f64, f64)) -> f64 {
    let dx = right_inner.0 - left_inner.0;
    let dy = right_inner.1 - left_inner.1;
    (dx * dx + dy * dy).sqrt()
}

/// Computes face center offset from normalized screen center (0.5, 0.5).
#[inline(always)]
pub fn compute_face_center(
    left_inner: (f64, f64),
    left_outer: (f64, f64),
    right_inner: (f64, f64),
    right_outer: (f64, f64),
) -> (f64, f64) {
    let face_x = 0.25 * (left_inner.0 + left_outer.0 + right_inner.0 + right_outer.0) - 0.5;
    let face_y = 0.25 * (left_inner.1 + left_outer.1 + right_inner.1 + right_outer.1) - 0.5;
    (face_x, face_y)
}

/// 18-dimensional hybrid gaze feature vector.
pub type FeatureVector18D = [f64; 18];

/// Builds an 18-dimensional polynomial feature vector.
///
/// Vector layout:
/// `[1.0, lx, ly, rx, ry, pitch, yaw, roll, iod, face_x, face_y, lx*lx, ly*ly, rx*rx, ry*ry, lx*yaw, rx*yaw, 0.5*(ly+ry)*pitch]`
#[inline]
pub fn build_feature_vector_18d(
    lx: f64,
    ly: f64,
    rx: f64,
    ry: f64,
    pitch: f64,
    yaw: f64,
    roll: f64,
    iod: f64,
    face_x: f64,
    face_y: f64,
) -> FeatureVector18D {
    [
        1.0,
        lx,
        ly,
        rx,
        ry,
        pitch,
        yaw,
        roll,
        iod,
        face_x,
        face_y,
        lx * lx,
        ly * ly,
        rx * rx,
        ry * ry,
        lx * yaw,
        rx * yaw,
        0.5 * (ly + ry) * pitch,
    ]
}

/// Expands a legacy 7-dimensional feature vector `[lx, ly, rx, ry, pitch, yaw, roll]`
/// to the full 18-dimensional feature representation using default reference geometry.
#[inline]
pub fn expand_7d_to_18d(f7: &[f64; 7]) -> FeatureVector18D {
    build_feature_vector_18d(
        f7[0], f7[1], f7[2], f7[3], f7[4], f7[5], f7[6],
        0.12, // Default typical interocular distance
        0.0,  // Centered face x
        0.0,  // Centered face y
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn test_kalman_1d_convergence() {
        let mut kf = SimpleKalman1D::new(10.0);
        let dt = 0.0166;
        for _ in 0..100 {
            kf.step(10.0, dt);
        }
        assert!((kf.x - 10.0).abs() < 1e-4);
        assert!(kf.v.abs() < 1e-3);
    }

    #[test]
    fn test_anatomical_rotation_invariance_15deg() {
        // Base geometry: centered at (0.5, 0.5)
        let left_inner = (0.46, 0.50);
        let left_outer = (0.40, 0.50);
        let left_iris = [
            (0.43, 0.50),
            (0.44, 0.50),
            (0.42, 0.50),
            (0.43, 0.49),
            (0.43, 0.51),
        ];

        let right_inner = (0.54, 0.50);
        let right_outer = (0.60, 0.50);
        let right_iris = [
            (0.57, 0.50),
            (0.58, 0.50),
            (0.56, 0.50),
            (0.57, 0.49),
            (0.57, 0.51),
        ];

        let base_landmarks = RawEyeLandmarks {
            left_inner,
            left_outer,
            right_inner,
            right_outer,
            left_iris,
            right_iris,
            ear_left: 0.30,
            ear_right: 0.30,
            matrix_4x4: None,
            pitch: 0.0,
            yaw: 0.0,
            roll: 0.0,
        };

        let base_coords = extract_anatomical_iris_coords(&base_landmarks).expect("Base should be valid");

        // Helper to rotate a 2D point around (0.5, 0.5)
        let rotate_point = |p: (f64, f64), angle_rad: f64| -> (f64, f64) {
            let cos_a = angle_rad.cos();
            let sin_a = angle_rad.sin();
            let dx = p.0 - 0.5;
            let dy = p.1 - 0.5;
            (0.5 + dx * cos_a - dy * sin_a, 0.5 + dx * sin_a + dy * cos_a)
        };

        // Test with +15 degrees and -15 degrees rotation
        for deg in [15.0, -15.0, 10.0, -10.0] {
            let angle_rad = deg * PI / 180.0;
            let rot_left_iris = [
                rotate_point(left_iris[0], angle_rad),
                rotate_point(left_iris[1], angle_rad),
                rotate_point(left_iris[2], angle_rad),
                rotate_point(left_iris[3], angle_rad),
                rotate_point(left_iris[4], angle_rad),
            ];
            let rot_right_iris = [
                rotate_point(right_iris[0], angle_rad),
                rotate_point(right_iris[1], angle_rad),
                rotate_point(right_iris[2], angle_rad),
                rotate_point(right_iris[3], angle_rad),
                rotate_point(right_iris[4], angle_rad),
            ];

            let rot_landmarks = RawEyeLandmarks {
                left_inner: rotate_point(left_inner, angle_rad),
                left_outer: rotate_point(left_outer, angle_rad),
                right_inner: rotate_point(right_inner, angle_rad),
                right_outer: rotate_point(right_outer, angle_rad),
                left_iris: rot_left_iris,
                right_iris: rot_right_iris,
                ear_left: 0.30,
                ear_right: 0.30,
                matrix_4x4: None,
                pitch: 0.0,
                yaw: 0.0,
                roll: angle_rad,
            };

            let rot_coords = extract_anatomical_iris_coords(&rot_landmarks).expect("Rotated should be valid");

            // Absolute difference must be < 1e-6
            let diff_lx = (rot_coords.0 - base_coords.0).abs();
            let diff_ly = (rot_coords.1 - base_coords.1).abs();
            let diff_rx = (rot_coords.2 - base_coords.2).abs();
            let diff_ry = (rot_coords.3 - base_coords.3).abs();

            assert!(
                diff_lx < 1e-6,
                "Rotated lx difference too large: {} at {} deg",
                diff_lx,
                deg
            );
            assert!(
                diff_ly < 1e-6,
                "Rotated ly difference too large: {} at {} deg",
                diff_ly,
                deg
            );
            assert!(
                diff_rx < 1e-6,
                "Rotated rx difference too large: {} at {} deg",
                diff_rx,
                deg
            );
            assert!(
                diff_ry < 1e-6,
                "Rotated ry difference too large: {} at {} deg",
                diff_ry,
                deg
            );
        }
    }

    #[test]
    fn test_feature_vector_18d_expansion() {
        let f7 = [0.45, 0.55, 0.46, 0.54, 0.1, -0.05, 0.02];
        let f18 = expand_7d_to_18d(&f7);
        assert_eq!(f18.len(), 18);
        assert_eq!(f18[0], 1.0);
        assert_eq!(f18[1], 0.45);
        assert_eq!(f18[2], 0.55);
        assert_eq!(f18[3], 0.46);
        assert_eq!(f18[4], 0.54);
        assert_eq!(f18[5], 0.1);
        assert_eq!(f18[6], -0.05);
        assert_eq!(f18[7], 0.02);
        assert_eq!(f18[8], 0.12);
        assert_eq!(f18[9], 0.0);
        assert_eq!(f18[10], 0.0);
    }
}
