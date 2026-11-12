//! Calibration and drift correction module.
//!
//! Implements Huber Robust Ridge Regression with 5-iteration Iteratively Reweighted
//! Least Squares (IRLS) using symmetric Jacobi eigenvalue decomposition, as well
//! as an implicit temporal drift corrector.

use crate::features::FeatureVector18D;

/// Metrics summarizing calibration fit quality.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CalibrationMetrics {
    /// Mean Absolute Error in X coordinates (pixels)
    pub mae_x: f64,
    /// Mean Absolute Error in Y coordinates (pixels)
    pub mae_y: f64,
    /// Mean Absolute 2D Euclidean Error (pixels)
    pub mae_2d: f64,
    /// Coefficient of determination for X
    pub r2_x: f64,
    /// Coefficient of determination for Y
    pub r2_y: f64,
    /// Ratio of inlier samples (residual <= huber threshold)
    pub inlier_ratio: f64,
    /// Mean 2D error strictly on inlier samples (pixels)
    pub inlier_mae_2d: f64,
}

impl Default for CalibrationMetrics {
    fn default() -> Self {
        Self {
            mae_x: 0.0,
            mae_y: 0.0,
            mae_2d: 0.0,
            r2_x: 0.0,
            r2_y: 0.0,
            inlier_ratio: 0.0,
            inlier_mae_2d: 0.0,
        }
    }
}

/// Solves a symmetric positive semi-definite 18x18 linear system A * w = b using
/// cyclic Jacobi eigenvalue decomposition with Tikhonov pseudo-inversion.
///
/// Guaranteed never to divide by zero or diverge on singular/collinear inputs.
pub fn solve_symmetric_18x18(
    a: &[[f64; 18]; 18],
    bx: &[f64; 18],
    by: &[f64; 18],
) -> ([f64; 18], [f64; 18]) {
    let mut d = *a;
    let mut v = [[0.0; 18]; 18];
    for i in 0..18 {
        v[i][i] = 1.0;
    }

    // Cyclic Jacobi sweeps (typically converges within 5-8 sweeps)
    for _sweep in 0..8 {
        let mut max_off_diag: f64 = 0.0;
        for p in 0..17 {
            for q in (p + 1)..18 {
                let off = d[p][q].abs();
                if off > max_off_diag {
                    max_off_diag = off;
                }
            }
        }
        if max_off_diag < 1e-10 {
            break;
        }

        for p in 0..17 {
            for q in (p + 1)..18 {
                let d_pq = d[p][q];
                if d_pq.abs() < 1e-15 {
                    continue;
                }

                let h = d[q][q] - d[p][p];
                let t = if h.abs() + d_pq.abs() == h.abs() {
                    d_pq / h
                } else {
                    let phi = h / (2.0 * d_pq);
                    let mut t_val = 1.0 / (phi.abs() + (1.0 + phi * phi).sqrt());
                    if phi < 0.0 {
                        t_val = -t_val;
                    }
                    t_val
                };

                let c = 1.0 / (1.0 + t * t).sqrt();
                let s = t * c;
                let tau = s / (1.0 + c);

                d[p][q] = 0.0;
                d[q][p] = 0.0;
                d[p][p] -= t * d_pq;
                d[q][q] += t * d_pq;

                for r in 0..p {
                    let g = d[r][p];
                    let h_val = d[r][q];
                    d[r][p] = g - s * (h_val + g * tau);
                    d[p][r] = d[r][p];
                    d[r][q] = h_val + s * (g - h_val * tau);
                    d[q][r] = d[r][q];
                }

                for r in (p + 1)..q {
                    let g = d[p][r];
                    let h_val = d[r][q];
                    d[p][r] = g - s * (h_val + g * tau);
                    d[r][p] = d[p][r];
                    d[r][q] = h_val + s * (g - h_val * tau);
                    d[q][r] = d[r][q];
                }

                for r in (q + 1)..18 {
                    let g = d[p][r];
                    let h_val = d[q][r];
                    d[p][r] = g - s * (h_val + g * tau);
                    d[r][p] = d[p][r];
                    d[q][r] = h_val + s * (g - h_val * tau);
                    d[r][q] = d[q][r];
                }

                for r in 0..18 {
                    let g = v[r][p];
                    let h_val = v[r][q];
                    v[r][p] = g - s * (h_val + g * tau);
                    v[r][q] = h_val + s * (g - h_val * tau);
                }
            }
        }
    }

    // Determine max eigenvalue for pseudo-inverse condition check
    let mut sigma_max: f64 = 0.0;
    for j in 0..18 {
        let ev = d[j][j].abs();
        if ev > sigma_max {
            sigma_max = ev;
        }
    }

    let threshold = 1e-8 * sigma_max;
    let mut inv_d = [0.0; 18];
    for j in 0..18 {
        let ev = d[j][j];
        if ev > threshold {
            inv_d[j] = 1.0 / ev;
        } else {
            inv_d[j] = 0.0;
        }
    }

    // w = V * inv_d * V^T * b
    let mut yx = [0.0; 18];
    let mut yy = [0.0; 18];
    for j in 0..18 {
        let mut sum_x = 0.0;
        let mut sum_y = 0.0;
        for r in 0..18 {
            sum_x += v[r][j] * bx[r];
            sum_y += v[r][j] * by[r];
        }
        yx[j] = sum_x * inv_d[j];
        yy[j] = sum_y * inv_d[j];
    }

    let mut wx = [0.0; 18];
    let mut wy = [0.0; 18];
    for k in 0..18 {
        let mut sum_x = 0.0;
        let mut sum_y = 0.0;
        for j in 0..18 {
            sum_x += v[k][j] * yx[j];
            sum_y += v[k][j] * yy[j];
        }
        wx[k] = sum_x;
        wy[k] = sum_y;
    }

    (wx, wy)
}

/// Robust ridge calibrator using Huber loss weighting to reject blinks,
/// saccades, and eye-tracker outliers.
#[derive(Debug, Clone)]
pub struct HuberRidgeCalibrator {
    /// 18-element regression weights for X screen coordinate
    pub coeffs_x: [f64; 18],
    /// 18-element regression weights for Y screen coordinate
    pub coeffs_y: [f64; 18],
    /// Ridge L2 regularization parameter lambda
    pub lambda: f64,
    /// Default Huber loss transition threshold (pixels)
    pub huber_delta: f64,
    /// Calibration state indicator
    pub is_calibrated: bool,
}

impl Default for HuberRidgeCalibrator {
    fn default() -> Self {
        Self {
            coeffs_x: [0.0; 18],
            coeffs_y: [0.0; 18],
            lambda: 0.005,
            huber_delta: 45.0,
            is_calibrated: false,
        }
    }
}

impl HuberRidgeCalibrator {
    /// Creates a new calibrator with custom lambda and huber delta.
    pub fn new(lambda: f64, huber_delta: f64) -> Self {
        Self {
            coeffs_x: [0.0; 18],
            coeffs_y: [0.0; 18],
            lambda,
            huber_delta,
            is_calibrated: false,
        }
    }

    /// Predicts gaze screen coordinates (x, y) from an 18D feature vector.
    #[inline]
    pub fn predict(&self, feat: &FeatureVector18D) -> (f64, f64) {
        let mut px = 0.0;
        let mut py = 0.0;
        for j in 0..18 {
            px += self.coeffs_x[j] * feat[j];
            py += self.coeffs_y[j] * feat[j];
        }
        (px, py)
    }

    /// Fits calibration weights on given samples `[(feature_18d, (target_x, target_y))]`
    /// using 5 iterations of Huber IRLS.
    pub fn calibrate(
        &mut self,
        samples: &[(FeatureVector18D, (f64, f64))],
    ) -> Result<CalibrationMetrics, &'static str> {
        let n = samples.len();
        if n < 18 {
            return Err("At least 18 calibration samples required");
        }

        let mut weights = vec![1.0; n];
        let mut current_delta = self.huber_delta;

        let mut wx = [0.0; 18];
        let mut wy = [0.0; 18];

        // 5 Iteratively Reweighted Least Squares iterations
        for iter in 0..5 {
            // Construct normal matrix A = X^T * W * X + lambda * I
            // and right hand side vectors bx = X^T * W * yx, by = X^T * W * yy
            let mut a = [[0.0; 18]; 18];
            let mut bx = [0.0; 18];
            let mut by = [0.0; 18];

            for i in 0..n {
                let w = weights[i];
                let (feat, (tx, ty)) = &samples[i];

                for j in 0..18 {
                    let w_feat_j = w * feat[j];
                    bx[j] += w_feat_j * tx;
                    by[j] += w_feat_j * ty;

                    for k in j..18 {
                        a[j][k] += w_feat_j * feat[k];
                    }
                }
            }

            // Fill lower triangle and add ridge diagonal
            for j in 0..18 {
                a[j][j] += self.lambda;
                for k in (j + 1)..18 {
                    a[k][j] = a[j][k];
                }
            }

            // Solve system using symmetric Jacobi eigenvalue decomposition
            let (sol_x, sol_y) = solve_symmetric_18x18(&a, &bx, &by);
            wx = sol_x;
            wy = sol_y;

            if iter < 4 {
                // Compute residuals and update weights
                let mut residuals = Vec::with_capacity(n);
                for (feat, (tx, ty)) in samples {
                    let mut pred_x = 0.0;
                    let mut pred_y = 0.0;
                    for j in 0..18 {
                        pred_x += wx[j] * feat[j];
                        pred_y += wy[j] * feat[j];
                    }
                    let res = ((pred_x - tx).powi(2) + (pred_y - ty).powi(2)).sqrt();
                    residuals.push(res);
                }

                // Compute median residual
                let mut sorted_res = residuals.clone();
                sorted_res.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                let median_res = if n % 2 == 1 {
                    sorted_res[n / 2]
                } else {
                    0.5 * (sorted_res[n / 2 - 1] + sorted_res[n / 2])
                };

                current_delta = (1.345 * median_res).max(35.0);

                // Update Huber weights
                for i in 0..n {
                    let r = residuals[i];
                    weights[i] = if r <= current_delta {
                        1.0
                    } else {
                        current_delta / r
                    };
                }
            }
        }

        self.coeffs_x = wx;
        self.coeffs_y = wy;
        self.is_calibrated = true;

        // Compute validation metrics
        let mut sum_err_x = 0.0;
        let mut sum_err_y = 0.0;
        let mut sum_err_2d = 0.0;
        let mut sum_target_x = 0.0;
        let mut sum_target_y = 0.0;

        let mut inlier_count = 0;
        let mut inlier_sum_err_2d = 0.0;
        let mut inlier_sum_target_x = 0.0;
        let mut inlier_sum_target_y = 0.0;
        let mut inlier_preds = Vec::with_capacity(n);
        let mut inlier_targets = Vec::with_capacity(n);

        for (feat, (tx, ty)) in samples {
            let (px, py) = self.predict(feat);
            let err_x = (px - tx).abs();
            let err_y = (py - ty).abs();
            let err_2d = (err_x * err_x + err_y * err_y).sqrt();

            sum_err_x += err_x;
            sum_err_y += err_y;
            sum_err_2d += err_2d;
            sum_target_x += tx;
            sum_target_y += ty;

            if err_2d <= current_delta {
                inlier_count += 1;
                inlier_sum_err_2d += err_2d;
                inlier_sum_target_x += tx;
                inlier_sum_target_y += ty;
                inlier_preds.push((px, py));
                inlier_targets.push((*tx, *ty));
            }
        }

        let mean_tx = sum_target_x / (n as f64);
        let mean_ty = sum_target_y / (n as f64);

        let mut ss_tot_x = 0.0;
        let mut ss_tot_y = 0.0;
        let mut ss_res_x = 0.0;
        let mut ss_res_y = 0.0;

        for (feat, (tx, ty)) in samples {
            let (px, py) = self.predict(feat);
            ss_tot_x += (tx - mean_tx).powi(2);
            ss_tot_y += (ty - mean_ty).powi(2);
            ss_res_x += (tx - px).powi(2);
            ss_res_y += (ty - py).powi(2);
        }

        // If inliers exist, compute R^2 on inliers
        let (r2_x, r2_y) = if inlier_count >= 2 {
            let mean_in_tx = inlier_sum_target_x / (inlier_count as f64);
            let mean_in_ty = inlier_sum_target_y / (inlier_count as f64);
            let mut in_ss_tot_x = 0.0;
            let mut in_ss_tot_y = 0.0;
            let mut in_ss_res_x = 0.0;
            let mut in_ss_res_y = 0.0;

            for i in 0..inlier_count {
                let (px, py) = inlier_preds[i];
                let (tx, ty) = inlier_targets[i];
                in_ss_tot_x += (tx - mean_in_tx).powi(2);
                in_ss_tot_y += (ty - mean_in_ty).powi(2);
                in_ss_res_x += (tx - px).powi(2);
                in_ss_res_y += (ty - py).powi(2);
            }

            let r2_x_val = if in_ss_tot_x > 1e-12 {
                (1.0 - in_ss_res_x / in_ss_tot_x).max(0.0)
            } else {
                1.0
            };
            let r2_y_val = if in_ss_tot_y > 1e-12 {
                (1.0 - in_ss_res_y / in_ss_tot_y).max(0.0)
            } else {
                1.0
            };
            (r2_x_val, r2_y_val)
        } else {
            let r2_x_val = if ss_tot_x > 1e-12 {
                (1.0 - ss_res_x / ss_tot_x).max(0.0)
            } else {
                1.0
            };
            let r2_y_val = if ss_tot_y > 1e-12 {
                (1.0 - ss_res_y / ss_tot_y).max(0.0)
            } else {
                1.0
            };
            (r2_x_val, r2_y_val)
        };

        let inlier_ratio = (inlier_count as f64) / (n as f64);
        let inlier_mae_2d = if inlier_count > 0 {
            inlier_sum_err_2d / (inlier_count as f64)
        } else {
            sum_err_2d / (n as f64)
        };

        Ok(CalibrationMetrics {
            mae_x: sum_err_x / (n as f64),
            mae_y: sum_err_y / (n as f64),
            mae_2d: sum_err_2d / (n as f64),
            r2_x,
            r2_y,
            inlier_ratio,
            inlier_mae_2d,
        })
    }
}

/// A single observation sample for online drift calibration.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DriftSample {
    pub pred_x: f64,
    pub pred_y: f64,
    pub target_x: f64,
    pub target_y: f64,
    pub weight: f64,
}

/// Implicit drift corrector maintaining a sliding window of up to 24 confirmation points.
///
/// Smooths offset drifts with exponential parameter alpha = 0.18 and limits maximum
/// offset to [-120.0, 120.0] pixels to prevent divergence.
#[derive(Debug, Clone)]
pub struct ImplicitDriftCorrector {
    /// Window buffer storing recent confirmation events
    pub samples: Vec<DriftSample>,
    /// Smoothed drift compensation in X (pixels)
    pub drift_x: f64,
    /// Smoothed drift compensation in Y (pixels)
    pub drift_y: f64,
    /// Exponential smoothing rate
    pub alpha: f64,
    /// Maximum allowed drift clamp (pixels)
    pub max_drift: f64,
}

impl Default for ImplicitDriftCorrector {
    fn default() -> Self {
        Self {
            samples: Vec::with_capacity(24),
            drift_x: 0.0,
            drift_y: 0.0,
            alpha: 0.18,
            max_drift: 120.0,
        }
    }
}

impl ImplicitDriftCorrector {
    /// Creates a new drift corrector.
    pub fn new() -> Self {
        Self::default()
    }

    /// Resets all drift samples and offsets to zero.
    pub fn reset(&mut self) {
        self.samples.clear();
        self.drift_x = 0.0;
        self.drift_y = 0.0;
    }

    /// Adds a confirmed user interaction sample and updates smoothed drift.
    pub fn add_sample(
        &mut self,
        pred_x: f64,
        pred_y: f64,
        target_x: f64,
        target_y: f64,
        weight: f64,
    ) {
        if self.samples.len() >= 24 {
            self.samples.remove(0);
        }

        self.samples.push(DriftSample {
            pred_x,
            pred_y,
            target_x,
            target_y,
            weight: weight.max(0.01),
        });

        // Compute weighted average offset
        let mut sum_w = 0.0;
        let mut sum_dx = 0.0;
        let mut sum_dy = 0.0;

        for s in &self.samples {
            sum_w += s.weight;
            sum_dx += s.weight * (s.target_x - s.pred_x);
            sum_dy += s.weight * (s.target_y - s.pred_y);
        }

        if sum_w > 1e-6 {
            let avg_dx = (sum_dx / sum_w).clamp(-self.max_drift, self.max_drift);
            let avg_dy = (sum_dy / sum_w).clamp(-self.max_drift, self.max_drift);

            self.drift_x = (1.0 - self.alpha) * self.drift_x + self.alpha * avg_dx;
            self.drift_y = (1.0 - self.alpha) * self.drift_y + self.alpha * avg_dy;
        }
    }

    /// Applies smoothed drift correction to raw predicted gaze coordinates.
    #[inline]
    pub fn correct(&self, raw_x: f64, raw_y: f64) -> (f64, f64) {
        (raw_x + self.drift_x, raw_y + self.drift_y)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::build_feature_vector_18d;
    use std::time::Instant;

    #[test]
    fn test_huber_calibrator_convergence_and_speed() {
        let mut calibrator = HuberRidgeCalibrator::default();

        let num_samples = 180;
        let mut samples = Vec::with_capacity(num_samples);

        // Ground-truth affine mapping for screen 1920x1080:
        // x = 100.0 + 1720.0 * lx + 20.0 * yaw
        // y = 80.0 + 920.0 * ly + 30.0 * pitch
        for i in 0..num_samples {
            let t = (i as f64) / (num_samples as f64);
            let lx = 0.2 + 0.6 * ((t * 7.3).sin() * 0.5 + 0.5);
            let ly = 0.2 + 0.6 * ((t * 11.1).cos() * 0.5 + 0.5);
            let rx = lx + 0.01;
            let ry = ly + 0.01;
            let pitch = 0.05 * (t * 3.14).sin();
            let yaw = 0.05 * (t * 2.71).cos();
            let roll = 0.01;
            let iod = 0.12;
            let face_x = 0.0;
            let face_y = 0.0;

            let feat = build_feature_vector_18d(
                lx, ly, rx, ry, pitch, yaw, roll, iod, face_x, face_y,
            );

            let mut target_x = 100.0 + 1720.0 * lx + 20.0 * yaw;
            let mut target_y = 80.0 + 920.0 * ly + 30.0 * pitch;

            // 20% outliers with 400px deviation (simulating blinks/distraction)
            if i % 5 == 0 {
                target_x += 400.0;
                target_y -= 400.0;
            } else {
                // Inliers with small Gaussian-like noise (+- 2.0px)
                target_x += ((i % 3) as f64 - 1.0) * 2.0;
                target_y += (((i + 1) % 3) as f64 - 1.0) * 2.0;
            }

            samples.push((feat, (target_x, target_y)));
        }

        let start = Instant::now();
        let metrics = calibrator
            .calibrate(&samples)
            .expect("Calibration should succeed");
        let duration = start.elapsed();

        println!(
            "Calibration finished in {:?}, R2_x = {:.4}, R2_y = {:.4}, inlier_mae_2d = {:.2} px, inlier_ratio = {:.2}",
            duration, metrics.r2_x, metrics.r2_y, metrics.inlier_mae_2d, metrics.inlier_ratio
        );

        let max_allowed_ms = if cfg!(debug_assertions) { 10 } else { 2 };
        assert!(
            duration.as_millis() <= max_allowed_ms,
            "Calibration took too long: {:?}",
            duration
        );

        // Required: R^2 > 0.95 on inliers
        assert!(
            metrics.r2_x > 0.95,
            "R^2 in X must be > 0.95, got {}",
            metrics.r2_x
        );
        assert!(
            metrics.r2_y > 0.95,
            "R^2 in Y must be > 0.95, got {}",
            metrics.r2_y
        );

        // Required: inlier mae_2d < 15.0 px
        assert!(
            metrics.inlier_mae_2d < 15.0,
            "Inlier 2D MAE must be < 15.0 px, got {}",
            metrics.inlier_mae_2d
        );
        assert!(
            metrics.inlier_ratio >= 0.75,
            "Inlier ratio should be >= 75%, got {}",
            metrics.inlier_ratio
        );
    }

    #[test]
    fn test_implicit_drift_corrector() {
        let mut corrector = ImplicitDriftCorrector::new();

        // User looks at (500, 300) but model predicts (460, 280) -> offset +40, +20
        for _ in 0..15 {
            corrector.add_sample(460.0, 280.0, 500.0, 300.0, 1.0);
        }

        let (cx, cy) = corrector.correct(460.0, 280.0);
        assert!((cx - 500.0).abs() < 5.0, "Corrected X should be close to 500, got {}", cx);
        assert!((cy - 300.0).abs() < 5.0, "Corrected Y should be close to 300, got {}", cy);

        // Clamp test: huge offset +300px must be clamped to +120px
        corrector.reset();
        for _ in 0..20 {
            corrector.add_sample(100.0, 100.0, 450.0, 450.0, 1.0);
        }
        assert!(corrector.drift_x <= 120.0);
        assert!(corrector.drift_y <= 120.0);
    }
}
