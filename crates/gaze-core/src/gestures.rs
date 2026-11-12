//! Gaze gestures and intentional interaction module.
//!
//! Implements pitch-compensated EAR blink detection (mitigating downward gaze false blinks),
//! horizontal Saccadic stroke gesture recognition (previous/next question), and
//! circular Smooth Pursuit confirmation for critical actions.

use std::f64::consts::PI;

/// Dominant eye mode for blink interpretation.
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u8)]
pub enum DominantEye {
    Both = 0,
    LeftOnly = 1,
    RightOnly = 2,
}

/// Blink event types produced by the detector.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BlinkEvent {
    None,
    /// Quick intentional blink (80ms - 350ms) for clicking
    ShortBlink { duration_ms: f64, eye: u8 },
    /// Sustained eye closure (>= 350ms) for answer selection confirmation
    DwellConfirm { duration_ms: f64 },
}

/// Eye Aspect Ratio (EAR) detector with dynamic downward pitch compensation.
#[derive(Debug, Clone)]
pub struct PitchCompensatedEarDetector {
    /// Baseline EAR value for open eyes in resting position
    pub baseline_ear: f64,
    /// Dominant eye selection
    pub dominant_eye: DominantEye,
    /// Minimum closure duration (ms) to trigger a dwell confirmation
    pub blink_confirm_ms: f64,
    /// Internal timestamp when current eye closure started
    closure_start_ms: Option<f64>,
    /// Flag indicating if dwell event was already fired during current closure
    dwell_fired: bool,
    /// Last eye that closed (0 = both, 1 = left, 2 = right)
    last_closed_eye: u8,
}

impl Default for PitchCompensatedEarDetector {
    fn default() -> Self {
        Self {
            baseline_ear: 0.30,
            dominant_eye: DominantEye::Both,
            blink_confirm_ms: 350.0,
            closure_start_ms: None,
            dwell_fired: false,
            last_closed_eye: 0,
        }
    }
}

impl PitchCompensatedEarDetector {
    /// Creates a new detector with specified baseline and dominant eye.
    pub fn new(baseline_ear: f64, dominant_eye: DominantEye, blink_confirm_ms: f64) -> Self {
        Self {
            baseline_ear,
            dominant_eye,
            blink_confirm_ms,
            closure_start_ms: None,
            dwell_fired: false,
            last_closed_eye: 0,
        }
    }

    /// Calculates dynamic EAR threshold given normalized vertical gaze position y_norm in [0, 1].
    #[inline]
    pub fn dynamic_threshold(&self, y_norm: f64) -> f64 {
        let clamped_y = y_norm.clamp(0.0, 1.0);
        self.baseline_ear * (0.60 - 0.12 * clamped_y)
    }

    /// Evaluates current frame EAR and timestamp.
    pub fn update(
        &mut self,
        ear_left: f64,
        ear_right: f64,
        y_norm: f64,
        timestamp_ms: f64,
    ) -> BlinkEvent {
        let threshold = self.dynamic_threshold(y_norm);

        let left_closed = ear_left < threshold;
        let right_closed = ear_right < threshold;

        let is_closed = match self.dominant_eye {
            DominantEye::Both => left_closed && right_closed,
            DominantEye::LeftOnly => left_closed,
            DominantEye::RightOnly => right_closed,
        };

        let current_eye = if left_closed && right_closed {
            0
        } else if left_closed {
            1
        } else {
            2
        };

        if is_closed {
            if self.closure_start_ms.is_none() {
                self.closure_start_ms = Some(timestamp_ms);
                self.dwell_fired = false;
                self.last_closed_eye = current_eye;
            }

            let start_t = self.closure_start_ms.unwrap();
            let duration = timestamp_ms - start_t;

            if duration >= self.blink_confirm_ms && !self.dwell_fired {
                self.dwell_fired = true;
                return BlinkEvent::DwellConfirm {
                    duration_ms: duration,
                };
            }

            BlinkEvent::None
        } else {
            // Eyes are open
            if let Some(start_t) = self.closure_start_ms {
                let duration = timestamp_ms - start_t;
                self.closure_start_ms = None;

                if !self.dwell_fired && duration >= 80.0 && duration < self.blink_confirm_ms {
                    return BlinkEvent::ShortBlink {
                        duration_ms: duration,
                        eye: self.last_closed_eye,
                    };
                }
            }

            BlinkEvent::None
        }
    }
}

/// Saccadic horizontal navigation gesture events.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SaccadeEvent {
    None,
    /// Fast glance right followed by return to center (Next Question)
    SaccadeNext,
    /// Fast glance left followed by return to center (Previous Question)
    SaccadePrev,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum SaccadeState {
    Center,
    GlanceRight { start_ms: f64 },
    GlanceLeft { start_ms: f64 },
}

/// Saccadic stroke detector for hands-free quiz question navigation.
#[derive(Debug, Clone)]
pub struct SaccadicStrokeDetector {
    state: SaccadeState,
    last_trigger_ms: f64,
    cooldown_ms: f64,
}

impl Default for SaccadicStrokeDetector {
    fn default() -> Self {
        Self {
            state: SaccadeState::Center,
            last_trigger_ms: -10000.0,
            cooldown_ms: 1000.0,
        }
    }
}

impl SaccadicStrokeDetector {
    pub fn new() -> Self {
        Self::default()
    }

    /// Resets detector state.
    pub fn reset(&mut self) {
        self.state = SaccadeState::Center;
    }

    /// Updates detector with normalized gaze coordinates (x_norm in [0, 1]) and timestamp.
    pub fn update(&mut self, x_norm: f64, _y_norm: f64, timestamp_ms: f64) -> SaccadeEvent {
        if timestamp_ms - self.last_trigger_ms < self.cooldown_ms {
            return SaccadeEvent::None;
        }

        match self.state {
            SaccadeState::Center => {
                if x_norm > 0.90 {
                    self.state = SaccadeState::GlanceRight {
                        start_ms: timestamp_ms,
                    };
                } else if x_norm < 0.10 {
                    self.state = SaccadeState::GlanceLeft {
                        start_ms: timestamp_ms,
                    };
                }
                SaccadeEvent::None
            }
            SaccadeState::GlanceRight { start_ms } => {
                let duration = timestamp_ms - start_ms;
                if duration > 480.0 {
                    // Timeout: user is lingering at screen edge
                    self.state = SaccadeState::Center;
                    SaccadeEvent::None
                } else if x_norm < 0.80 {
                    // Returned to center within valid window
                    if duration >= 100.0 {
                        self.state = SaccadeState::Center;
                        self.last_trigger_ms = timestamp_ms;
                        SaccadeEvent::SaccadeNext
                    } else {
                        // Too fast (likely tracking noise)
                        self.state = SaccadeState::Center;
                        SaccadeEvent::None
                    }
                } else {
                    SaccadeEvent::None
                }
            }
            SaccadeState::GlanceLeft { start_ms } => {
                let duration = timestamp_ms - start_ms;
                if duration > 480.0 {
                    self.state = SaccadeState::Center;
                    SaccadeEvent::None
                } else if x_norm > 0.20 {
                    if duration >= 100.0 {
                        self.state = SaccadeState::Center;
                        self.last_trigger_ms = timestamp_ms;
                        SaccadeEvent::SaccadePrev
                    } else {
                        self.state = SaccadeState::Center;
                        SaccadeEvent::None
                    }
                } else {
                    SaccadeEvent::None
                }
            }
        }
    }
}

/// Circular Smooth Pursuit detector for high-risk action confirmation (e.g. "Submit Exam").
#[derive(Debug, Clone)]
pub struct SmoothPursuitDetector {
    /// Orbit period in milliseconds (default 1200.0 ms)
    pub period_ms: f64,
    /// Center of orbiting stimulus
    pub center: (f64, f64),
    /// Orbit radius in pixels
    pub radius: f64,
    /// Previous gaze position and timestamp
    last_gaze: Option<(f64, f64, f64)>,
    /// Sliding window of correlation values
    history_correlations: Vec<f64>,
    /// Number of consecutive valid correlation samples
    consecutive_matches: usize,
    /// Required consecutive samples to trigger
    pub required_consecutive: usize,
}

impl Default for SmoothPursuitDetector {
    fn default() -> Self {
        Self {
            period_ms: 1200.0,
            center: (960.0, 540.0),
            radius: 40.0,
            last_gaze: None,
            history_correlations: Vec::with_capacity(36),
            consecutive_matches: 0,
            required_consecutive: 20,
        }
    }
}

impl SmoothPursuitDetector {
    pub fn new(center_x: f64, center_y: f64, radius: f64, period_ms: f64) -> Self {
        Self {
            period_ms,
            center: (center_x, center_y),
            radius,
            last_gaze: None,
            history_correlations: Vec::with_capacity(36),
            consecutive_matches: 0,
            required_consecutive: 20,
        }
    }

    /// Resets detector tracking state.
    pub fn reset(&mut self) {
        self.last_gaze = None;
        self.history_correlations.clear();
        self.consecutive_matches = 0;
    }

    /// Updates detector with current gaze coordinates (gx, gy) and timestamp.
    ///
    /// Returns `(progress: f64, is_confirmed: bool, avg_correlation: f64)`.
    pub fn update(&mut self, gx: f64, gy: f64, timestamp_ms: f64) -> (f64, bool, f64) {
        // Orbit angle theta(t) = 2*PI * (t % period) / period
        let t_mod = timestamp_ms.rem_euclid(self.period_ms);
        let theta = 2.0 * PI * (t_mod / self.period_ms);

        // Unit tangent vector of clockwise circular trajectory: (-sin(theta), cos(theta))
        let target_tx = -theta.sin();
        let target_ty = theta.cos();

        let mut correlation = 0.0;

        if let Some((prev_x, prev_y, prev_t)) = self.last_gaze {
            let dt = (timestamp_ms - prev_t) * 0.001; // in seconds
            if dt > 0.005 && dt < 0.100 {
                let vx = (gx - prev_x) / dt;
                let vy = (gy - prev_y) / dt;
                let speed = (vx * vx + vy * vy).sqrt();

                if speed > 10.0 {
                    let eye_ux = vx / speed;
                    let eye_uy = vy / speed;

                    // Cosine similarity
                    correlation = eye_ux * target_tx + eye_uy * target_ty;
                }
            }
        }

        self.last_gaze = Some((gx, gy, timestamp_ms));

        if self.history_correlations.len() >= 36 {
            self.history_correlations.remove(0);
        }
        self.history_correlations.push(correlation);

        let sum_corr: f64 = self.history_correlations.iter().sum();
        let avg_corr = if !self.history_correlations.is_empty() {
            sum_corr / (self.history_correlations.len() as f64)
        } else {
            0.0
        };

        if correlation > 0.72 {
            self.consecutive_matches += 1;
        } else {
            self.consecutive_matches = self.consecutive_matches.saturating_sub(1);
        }

        let is_confirmed = self.consecutive_matches >= self.required_consecutive && avg_corr > 0.72;
        let progress = (self.consecutive_matches as f64 / self.required_consecutive as f64).clamp(0.0, 1.0);

        (progress, is_confirmed, avg_corr)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pitch_compensated_ear_detector() {
        let mut detector = PitchCompensatedEarDetector::default();
        detector.baseline_ear = 0.30;

        // When looking straight (y_norm = 0.0): threshold = 0.30 * 0.60 = 0.18
        let thresh_straight = detector.dynamic_threshold(0.0);
        assert!((thresh_straight - 0.18).abs() < 1e-5);

        // When looking down at lower screen (y_norm = 0.90 for answers C, D):
        // threshold = 0.30 * (0.60 - 0.12 * 0.90) = 0.30 * 0.492 = 0.1476
        let thresh_down = detector.dynamic_threshold(0.90);
        assert!((thresh_down - 0.1476).abs() < 1e-5);

        // When looking down, natural eyelid narrowing yields EAR = 0.16.
        // With standard fixed threshold (0.18), this would falsely trigger a blink!
        // With pitch compensation (0.1476), it should NOT trigger a blink:
        let ev = detector.update(0.16, 0.16, 0.90, 100.0);
        assert_eq!(ev, BlinkEvent::None, "Natural squinting at bottom screen must NOT trigger blink");

        // Now test true intentional dwell closure for 400ms:
        detector.update(0.10, 0.10, 0.90, 200.0);
        let ev2 = detector.update(0.10, 0.10, 0.90, 560.0);
        match ev2 {
            BlinkEvent::DwellConfirm { duration_ms } => {
                assert!(duration_ms >= 350.0);
            }
            _ => panic!("Expected DwellConfirm event, got {:?}", ev2),
        }
    }

    #[test]
    fn test_saccadic_stroke_detector() {
        let mut detector = SaccadicStrokeDetector::new();

        // Start in center
        assert_eq!(detector.update(0.50, 0.50, 0.0), SaccadeEvent::None);

        // Glance quickly to right edge (x > 0.90) at t = 100ms
        assert_eq!(detector.update(0.94, 0.50, 100.0), SaccadeEvent::None);

        // Return to center (x < 0.80) at t = 300ms (duration 200ms in [100ms, 480ms])
        let ev = detector.update(0.55, 0.50, 300.0);
        assert_eq!(ev, SaccadeEvent::SaccadeNext, "Should fire SaccadeNext on right flick");

        // Cooldown check: flicking again at t = 500ms should be ignored (< 1000ms cooldown)
        detector.update(0.95, 0.50, 500.0);
        let ev_cooldown = detector.update(0.50, 0.50, 650.0);
        assert_eq!(ev_cooldown, SaccadeEvent::None, "Cooldown must prevent rapid repeated triggers");

        // Left flick after cooldown at t = 1500ms
        assert_eq!(detector.update(0.05, 0.50, 1500.0), SaccadeEvent::None);
        let ev_left = detector.update(0.40, 0.50, 1700.0);
        assert_eq!(ev_left, SaccadeEvent::SaccadePrev, "Should fire SaccadePrev on left flick");
    }

    #[test]
    fn test_smooth_pursuit_detector() {
        let mut detector = SmoothPursuitDetector::new(500.0, 500.0, 40.0, 1200.0);
        let mut confirmed = false;

        // Simulate 25 consecutive samples following circular trajectory
        // theta(t) = 2*PI * t / 1200
        let r = 40.0;
        let cx = 500.0;
        let cy = 500.0;

        for step in 0..26 {
            let t = step as f64 * 33.33; // ~30 FPS
            let theta = 2.0 * PI * (t / 1200.0);
            let gx = cx + r * theta.cos();
            let gy = cy + r * theta.sin();

            let (_progress, is_conf, _avg) = detector.update(gx, gy, t);
            if is_conf {
                confirmed = true;
                break;
            }
        }

        assert!(confirmed, "Smooth pursuit should confirm after 20+ correlated samples");
    }
}
