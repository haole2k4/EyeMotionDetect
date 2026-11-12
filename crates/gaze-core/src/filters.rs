//! Filtering, temporal smoothing, and magnetic UI snapping module.
//!
//! Provides the 1€ Filter (OneEuroFilter2D), a Critically-Damped Spring Interpolator
//! for silky 144Hz animation loops, and MagneticTargetSnap for UI button lock-on.

use std::f64::consts::PI;

/// Low-pass helper for 1D signal smoothing.
#[derive(Debug, Clone, Copy, PartialEq)]
struct LowPassFilter1D {
    hat_x_prev: Option<f64>,
}

impl LowPassFilter1D {
    fn new() -> Self {
        Self { hat_x_prev: None }
    }

    fn reset(&mut self) {
        self.hat_x_prev = None;
    }

    fn filter(&mut self, x: f64, alpha: f64) -> f64 {
        let hat_x = match self.hat_x_prev {
            Some(prev) => alpha * x + (1.0 - alpha) * prev,
            None => x,
        };
        self.hat_x_prev = Some(hat_x);
        hat_x
    }
}

/// 1D One-Euro Filter implementation based on Casiez et al. (CHI 2012).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct OneEuroFilter1D {
    pub min_cutoff: f64,
    pub beta: f64,
    pub d_cutoff: f64,
    x_filter: LowPassFilter1D,
    dx_filter: LowPassFilter1D,
    last_x: Option<f64>,
}

impl OneEuroFilter1D {
    pub fn new(min_cutoff: f64, beta: f64, d_cutoff: f64) -> Self {
        Self {
            min_cutoff,
            beta,
            d_cutoff,
            x_filter: LowPassFilter1D::new(),
            dx_filter: LowPassFilter1D::new(),
            last_x: None,
        }
    }

    pub fn reset(&mut self) {
        self.x_filter.reset();
        self.dx_filter.reset();
        self.last_x = None;
    }

    fn alpha(rate: f64, cutoff: f64) -> f64 {
        let tau = 1.0 / (2.0 * PI * cutoff);
        let te = 1.0 / rate;
        1.0 / (1.0 + tau / te)
    }

    pub fn filter(&mut self, x: f64, dt_sec: f64) -> f64 {
        let rate = if dt_sec > 0.0001 { 1.0 / dt_sec } else { 60.0 };

        let dx = match self.last_x {
            Some(prev) => (x - prev) * rate,
            None => 0.0,
        };
        self.last_x = Some(x);

        let d_alpha = Self::alpha(rate, self.d_cutoff);
        let edx = self.dx_filter.filter(dx, d_alpha);

        let cutoff = self.min_cutoff + self.beta * edx.abs();
        let alpha = Self::alpha(rate, cutoff);

        self.x_filter.filter(x, alpha)
    }
}

/// 2D One-Euro Filter with Euclidean dead-zone suppression.
#[derive(Debug, Clone)]
pub struct OneEuroFilter2D {
    filter_x: OneEuroFilter1D,
    filter_y: OneEuroFilter1D,
    pub dead_zone: f64,
    last_output: Option<(f64, f64)>,
}

impl Default for OneEuroFilter2D {
    fn default() -> Self {
        Self::new(1.05, 0.008, 1.0, 3.5)
    }
}

impl OneEuroFilter2D {
    /// Creates a new 2D 1€ filter with recommended gaze defaults.
    pub fn new(min_cutoff: f64, beta: f64, d_cutoff: f64, dead_zone: f64) -> Self {
        Self {
            filter_x: OneEuroFilter1D::new(min_cutoff, beta, d_cutoff),
            filter_y: OneEuroFilter1D::new(min_cutoff, beta, d_cutoff),
            dead_zone,
            last_output: None,
        }
    }

    /// Resets filter history.
    pub fn reset(&mut self) {
        self.filter_x.reset();
        self.filter_y.reset();
        self.last_output = None;
    }

    /// Filters 2D coordinates with time step dt_sec (seconds).
    pub fn filter(&mut self, x: f64, y: f64, dt_sec: f64) -> (f64, f64) {
        let fx = self.filter_x.filter(x, dt_sec);
        let fy = self.filter_y.filter(y, dt_sec);

        if let Some((prev_x, prev_y)) = self.last_output {
            let dist = ((fx - prev_x).powi(2) + (fy - prev_y).powi(2)).sqrt();
            if dist < self.dead_zone {
                // Within dead-zone jitter threshold, hold stable
                return (prev_x, prev_y);
            }
        }

        self.last_output = Some((fx, fy));
        (fx, fy)
    }
}

/// Critically-Damped Spring Interpolator for smooth 144Hz gaze reticle animation.
///
/// Stiffness = 280.0, Damping = 2 * sqrt(280.0) ensures critical damping (zeta = 1.0)
/// with zero oscillation and rapid settling.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SpringInterpolator2D {
    pub current_x: f64,
    pub current_y: f64,
    pub vel_x: f64,
    pub vel_y: f64,
    pub stiffness: f64,
    pub damping: f64,
    pub is_initialized: bool,
}

impl Default for SpringInterpolator2D {
    fn default() -> Self {
        let stiffness: f64 = 280.0;
        let damping = 2.0 * stiffness.sqrt();
        Self {
            current_x: 0.0,
            current_y: 0.0,
            vel_x: 0.0,
            vel_y: 0.0,
            stiffness,
            damping,
            is_initialized: false,
        }
    }
}

impl SpringInterpolator2D {
    /// Creates a new spring interpolator with default critical damping.
    pub fn new() -> Self {
        Self::default()
    }

    /// Resets the interpolator state.
    pub fn reset(&mut self, x: f64, y: f64) {
        self.current_x = x;
        self.current_y = y;
        self.vel_x = 0.0;
        self.vel_y = 0.0;
        self.is_initialized = true;
    }

    /// Updates the spring towards `(target_x, target_y)` by `dt_sec` seconds
    /// using exact analytical solution for critically damped harmonic motion.
    pub fn update(&mut self, target_x: f64, target_y: f64, dt_sec: f64) -> (f64, f64) {
        if !self.is_initialized {
            self.reset(target_x, target_y);
            return (target_x, target_y);
        }

        let dt = dt_sec.clamp(0.0001, 0.1);
        let omega = self.stiffness.sqrt();
        let exp_decay = (-omega * dt).exp();

        // X axis analytical solution
        let e0_x = self.current_x - target_x;
        let c1_x = e0_x;
        let c2_x = self.vel_x + omega * e0_x;
        let new_e_x = (c1_x + c2_x * dt) * exp_decay;
        let new_v_x = (self.vel_x - omega * c2_x * dt) * exp_decay;

        // Y axis analytical solution
        let e0_y = self.current_y - target_y;
        let c1_y = e0_y;
        let c2_y = self.vel_y + omega * e0_y;
        let new_e_y = (c1_y + c2_y * dt) * exp_decay;
        let new_v_y = (self.vel_y - omega * c2_y * dt) * exp_decay;

        self.current_x = target_x + new_e_x;
        self.vel_x = new_v_x;

        self.current_y = target_y + new_e_y;
        self.vel_y = new_v_y;

        (self.current_x, self.current_y)
    }
}

/// Target interactive rectangular element (e.g., Quiz answers A, B, C, D).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TargetRect {
    pub id: i32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub gravity_radius: f64,
}

/// Magnetic target snapping manager holding up to 16 active UI elements.
#[derive(Debug, Clone)]
pub struct MagneticTargetSnap {
    pub targets: [Option<TargetRect>; 16],
    pub target_count: usize,
}

impl Default for MagneticTargetSnap {
    fn default() -> Self {
        Self {
            targets: [None; 16],
            target_count: 0,
        }
    }
}

impl MagneticTargetSnap {
    /// Creates a new snap manager.
    pub fn new() -> Self {
        Self::default()
    }

    /// Clears all registered target rectangles.
    pub fn clear(&mut self) {
        for slot in &mut self.targets {
            *slot = None;
        }
        self.target_count = 0;
    }

    /// Adds or updates a target rectangle.
    pub fn add_target(&mut self, target: TargetRect) -> bool {
        // If target with same id exists, update it
        for slot in &mut self.targets {
            if let Some(t) = slot {
                if t.id == target.id {
                    *t = target;
                    return true;
                }
            }
        }

        // Add to first empty slot
        for slot in &mut self.targets {
            if slot.is_none() {
                *slot = Some(target);
                self.target_count += 1;
                return true;
            }
        }
        false
    }

    /// Computes magnetic snapped coordinates and returns `(snapped_x, snapped_y, active_target_id)`.
    pub fn snap(&self, gx: f64, gy: f64) -> (f64, f64, Option<i32>) {
        let mut best_target: Option<&TargetRect> = None;
        let mut best_dist = f64::MAX;
        let mut is_inside_best = false;

        for slot in &self.targets {
            if let Some(target) = slot {
                let inside_x = gx >= target.x && gx <= target.x + target.width;
                let inside_y = gy >= target.y && gy <= target.y + target.height;
                let is_inside = inside_x && inside_y;

                let dx_edge = if gx < target.x {
                    target.x - gx
                } else if gx > target.x + target.width {
                    gx - (target.x + target.width)
                } else {
                    0.0
                };

                let dy_edge = if gy < target.y {
                    target.y - gy
                } else if gy > target.y + target.height {
                    gy - (target.y + target.height)
                } else {
                    0.0
                };

                let dist_edge = (dx_edge * dx_edge + dy_edge * dy_edge).sqrt();

                if is_inside || dist_edge <= target.gravity_radius {
                    if is_inside && !is_inside_best {
                        is_inside_best = true;
                        best_dist = dist_edge;
                        best_target = Some(target);
                    } else if (is_inside && is_inside_best) || (!is_inside && !is_inside_best) {
                        if dist_edge < best_dist {
                            best_dist = dist_edge;
                            best_target = Some(target);
                        }
                    }
                }
            }
        }

        if let Some(target) = best_target {
            let cx = target.x + 0.5 * target.width;
            let cy = target.y + 0.5 * target.height;

            let dist_center = ((gx - cx).powi(2) + (gy - cy).powi(2)).sqrt();
            let half_diag = 0.5 * (target.width * target.width + target.height * target.height).sqrt();
            let r_eff = half_diag + target.gravity_radius;

            // Soft magnetic pull strength in [0.65, 0.92]
            let strength = if is_inside_best || dist_center < 0.6 * r_eff {
                0.88
            } else {
                let ratio = (best_dist / target.gravity_radius).clamp(0.0, 1.0);
                0.88 - 0.20 * ratio
            };

            let snapped_x = gx + strength * (cx - gx);
            let snapped_y = gy + strength * (cy - gy);

            (snapped_x, snapped_y, Some(target.id))
        } else {
            (gx, gy, None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_one_euro_filter_deadzone() {
        let mut filter = OneEuroFilter2D::new(1.05, 0.008, 1.0, 3.5);

        let dt = 0.016;
        let (x1, y1) = filter.filter(100.0, 100.0, dt);

        // Small micro-jitter of 2.0px (< 3.5px dead_zone)
        let (x2, y2) = filter.filter(102.0, 100.5, dt);
        assert_eq!((x1, y1), (x2, y2), "Jitter within dead-zone must be suppressed");

        // Significant saccade of 50px
        let (x3, _y3) = filter.filter(150.0, 150.0, dt);
        assert!((x3 - x1).abs() > 10.0, "Large movement must pass through");
    }

    #[test]
    fn test_spring_interpolator_critical_damping() {
        let mut spring = SpringInterpolator2D::new();
        spring.reset(0.0, 0.0);

        let target_x = 100.0;
        let target_y = 200.0;
        let dt = 1.0 / 144.0;

        let mut prev_x = 0.0;
        for _ in 0..144 {
            let (x, _) = spring.update(target_x, target_y, dt);
            assert!(
                x >= prev_x - 1e-6,
                "Critically damped spring must not overshoot target"
            );
            assert!(
                x <= target_x + 1e-4,
                "Critically damped spring must not oscillate beyond target"
            );
            prev_x = x;
        }

        // Settles close to target after ~1 second
        assert!((spring.current_x - target_x).abs() < 1.0);
        assert!((spring.current_y - target_y).abs() < 1.0);
    }

    #[test]
    fn test_magnetic_target_snap_buttons() {
        let mut snap = MagneticTargetSnap::new();

        // Button A at (100, 100), width 200, height 80, gravity 60
        // Center is (200, 140)
        snap.add_target(TargetRect {
            id: 1, // Button A
            x: 100.0,
            y: 100.0,
            width: 200.0,
            height: 80.0,
            gravity_radius: 60.0,
        });

        // Gaze with +-45px jitter inside / near button center
        let noisy_gx = 200.0 + 45.0; // 245
        let noisy_gy = 140.0 - 30.0; // 110

        let (snapped_x, snapped_y, active_id) = snap.snap(noisy_gx, noisy_gy);

        assert_eq!(active_id, Some(1), "Target ID 1 must be active");
        // Snapped point should be strongly pulled towards center (200, 140)
        assert!(
            (snapped_x - 200.0).abs() < (noisy_gx - 200.0).abs() * 0.25,
            "Snap should pull X strongly towards center"
        );
        assert!(
            (snapped_y - 140.0).abs() < (noisy_gy - 140.0).abs() * 0.25,
            "Snap should pull Y strongly towards center"
        );
    }
}
