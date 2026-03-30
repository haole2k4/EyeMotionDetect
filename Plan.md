# Eye Gaze Mouse Control — Kế Hoạch Chi Tiết Giải Pháp A

## L2CS-Net + Personal Calibration Layer

> **Mục tiêu:** Thay thế chuột máy tính bằng cử động mắt, hỗ trợ click trái/phải qua blink và di chuyển cursor qua gaze direction.
> **Thời gian ước tính:** 5–8 ngày làm việc
> **Yêu cầu phần cứng:** GPU RTX 3050 4GB VRAM, Webcam ≥ 720p 30fps

---

## Tổng quan kiến trúc

```
[Webcam]
   │
   ▼
[MediaPipe Face Mesh]
   ├── EAR (Eye Aspect Ratio) ──────────────► [Blink/Click Handler]
   │                                                │
   └── Face landmarks ──► [L2CS-Net Inference]      │
                               │ (yaw, pitch)        │
                               ▼                     │
                    [Calibration Mapper]             │
                      (Polynomial Regression)        │
                               │ (screen_x, screen_y)│
                               ▼                     ▼
                         [Gaze Smoother] ──► [pyautogui mouse control]
```

---

## Status rà soát thực tế (2026-03-30)

### Đã triển khai ổn

- EAR và Blink FSM đã có code riêng, có test case đánh giá.
- Calibration UI đã có flow đầy đủ: hiển thị điểm, đợi ổn định, thu nhiều frame, lấy median, lưu dataset.
- L2CS-Net wrapper đã hoạt động cho suy luận yaw/pitch.

### Chưa hoàn thiện theo nghĩa product

- Calibration Mapper (fit/infer polynomial) chưa là một luồng hoàn chỉnh để phục vụ runtime điều khiển chuột.
- Smoother và mouse-control loop chưa hoàn tất như kiến trúc mục tiêu.
- Chưa có backend persistence cho user profile, calibration history, model versions.
- Morse engine (nếu dùng blink sequence để nhập lệnh) chưa được đặc tả và implement.

### Quy ước khi port web

1. **Giữ nguyên logic lõi**: EAR, blink FSM, calibration sampling strategy.
2. **Không overclaim implementation**: các mục mapper/smoother/control/backend ghi rõ planned cho tới khi pass đủ test.
3. **Ưu tiên MVP đúng thứ tự**: Mapper -> Smoother -> Control loop -> Backend -> Fine-tuning nâng cao.

---

## Phase 0 — Chuẩn bị môi trường

### 0.1 — Cấu trúc thư mục dự án

```
gaze_mouse/
├── config/
│   └── settings.yaml           # Threshold, alpha, screen resolution...
├── models/
│   └── L2CSNet_gaze360.pkl     # Pretrained weights
├── calibration/
│   ├── calibrator.pkl          # Saved calibration model
│   └── calibration_data.json   # Raw calibration points (backup)
├── src/
│   ├── gaze_estimator.py       # Wrapper L2CS-Net
│   ├── blink_detector.py       # EAR logic
│   ├── calibration.py          # Calibration UI + mapper
│   ├── smoother.py             # EMA + outlier rejection
│   ├── mouse_controller.py     # pyautogui wrapper
│   └── pipeline.py             # Main loop
├── evaluation/
│   ├── accuracy_test.py        # Đánh giá độ chính xác
│   └── latency_test.py         # Đánh giá độ trễ
├── main.py
└── requirements.txt
```

### 0.2 — Dependencies

```
# requirements.txt
l2cs>=1.0.0
mediapipe>=0.10.0
opencv-python>=4.8.0
numpy>=1.24.0
scikit-learn>=1.3.0
pyautogui>=0.9.54
pyyaml>=6.0
joblib>=1.3.0
tk                    # Calibration UI (thường có sẵn)
```

> Lưu ý: phiên bản python là 3.12

### 0.3 — Kiểm tra CUDA

- Xác nhận PyTorch nhận GPU: `torch.cuda.is_available()` trả về `True`
- Kiểm tra VRAM: `nvidia-smi` → phải thấy ≥ 3.5GB free trước khi chạy
- Download pretrained weights từ repository L2CS-Net (file `.pkl` ~100MB)
- Chạy inference demo một lần với ảnh tĩnh để xác nhận pipeline hoạt động

### 0.4 — Cấu hình settings.yaml

```yaml
# config/settings.yaml
screen:
  width: 1920
  height: 1080

camera:
  index: 0
  width: 1280
  height: 720
  fps: 30

ear:
  blink_threshold: 0.21 # Dưới ngưỡng này = đang nhắm
  short_blink_min_ms: 250 # Chớp NGẮN HƠN ngưỡng này -> bỏ qua (chớp tự nhiên)
  short_blink_max_ms: 400 # Chớp dưới ngưỡng này = click trái
  long_blink_min_ms: 600 # Nhắm lâu (click phải)
  consecutive_frames: 3 # Số frame liên tiếp để xác nhận blink

smoother:
  ema_alpha: 0.25 # Nhỏ = mượt hơn nhưng lag hơn
  history_window: 7
  outlier_threshold_x: 250
  outlier_threshold_y: 180
  dead_zone_px: 8 # Không di chuyển nếu delta < 8px

calibration:
  grid_cols: 4
  grid_rows: 3
  samples_per_point: 20
  stable_wait_ms: 1200 # Chờ trước khi thu sample
  polynomial_degree: 2
```

---

## Phase 1 — Blink Detection (EAR)

### 1.1 — Implement EAR

**Công thức Soukupová:**

```
EAR = (||p2-p6|| + ||p3-p5||) / (2 × ||p1-p4||)
```

- `p1`–`p6` là 6 landmark quanh mắt theo thứ tự: góc trái, trên trái, trên phải, góc phải, dưới phải, dưới trái
- MediaPipe Face Mesh trả về 478 landmarks — map sang index của mắt trái và mắt phải

**MediaPipe landmark index (mắt):**

| Vị trí         | Mắt trái | Mắt phải |
| -------------- | -------- | -------- |
| Góc trái (p1)  | 362      | 33       |
| Trên trái (p2) | 385      | 160      |
| Trên phải (p3) | 387      | 158      |
| Góc phải (p4)  | 263      | 133      |
| Dưới phải (p5) | 373      | 153      |
| Dưới trái (p6) | 380      | 144      |

### 1.2 — Phân loại blink

```
EAR < threshold (0.21)
        │
        ▼
   Bắt đầu đếm thời gian
        │
   EAR > threshold
        │
  ├── Thời gian < 120ms      → Bỏ qua (chớp tự nhiên)
  ├── Thời gian 120-400ms    → SHORT BLINK → Click trái
  ├── Thời gian 600-2000ms   → LONG BLINK  → Click phải
  └── Vùng còn lại           → Bỏ qua
```

**Nguồn sự thật hiện tại cho blink timing:** `src/blink_detector.py`.
`config/settings.yaml` sẽ là nguồn chính khi pipeline đọc config đầy đủ ở runtime.

**Lưu ý quan trọng:**

- Tính EAR trung bình của **cả hai mắt** để tránh false positive khi một mắt bị che
- Thêm **cooldown 600ms** sau mỗi click để tránh double-click ngoài ý muốn
- Trong lúc blink (EAR < threshold), **đừng di chuyển cursor** — người dùng không nhìn được màn hình

### 1.3 — Evaluation cho Blink Detector

**Test cases cần pass:**

| Test                        | Cách thực hiện                           | Tiêu chí đạt           |
| --------------------------- | ---------------------------------------- | ---------------------- |
| False positive rate         | Ngồi bình thường 1 phút không cố ý click | < 2 click ngoài ý muốn |
| Chớp tự nhiên không trigger | Chớp mắt bình thường liên tục            | 0 click được tạo ra    |
| Short blink reliability     | Cố ý chớp 20 lần                         | ≥ 18/20 được nhận diện |
| Long blink reliability      | Cố ý nhắm 2s, 10 lần                     | ≥ 9/10 được nhận diện  |
| Phân biệt trái/phải         | 10 short + 10 long lần lượt              | Không nhầm loại        |

---

## Phase 2 — Gaze Estimation với L2CS-Net

### 2.1 — Wrapper L2CS-Net

- Khởi tạo `Pipeline` từ l2cs với device `cuda`
- Input: BGR frame từ OpenCV
- Output: `results.yaw[0]` và `results.pitch[0]` (đơn vị: độ)
- Kiểm tra `results.pitch is not None` trước khi dùng (trường hợp không detect được mặt)

**Lưu ý về output:**

- Yaw: âm = nhìn trái, dương = nhìn phải (thông thường range -40° đến +40°)
- Pitch: âm = nhìn lên, dương = nhìn xuống (thông thường -30° đến +30°)
- Các giá trị này **không tuyến tính** với pixel trên màn hình → cần Calibration Mapper

### 2.2 — Kiểm tra inference

Trước khi tích hợp, đo:

| Metric         | Cách đo                                           | Mục tiêu                        |
| -------------- | ------------------------------------------------- | ------------------------------- |
| Inference time | `time.perf_counter()` bao quanh `pipeline.step()` | < 33ms (≥ 30fps)                |
| VRAM usage     | `nvidia-smi` lúc đang chạy                        | < 2.5GB                         |
| CPU bottleneck | `htop` trong lúc chạy                             | CPU không phải nút thắt cổ chai |

**Nếu inference > 33ms:**

- Thử giảm resolution input xuống 640×480
- Dùng `torch.cuda.amp` (mixed precision)
- Skip L2CS-Net 1 frame, interpolate ở giữa

---

## Phase 3 — Thu thập Calibration Data

### 3.1 — Thiết lập điều kiện thu data

**Môi trường:**

- Ánh sáng ổn định, nguồn sáng phía trước (không bị ngược sáng)
- Tắt đèn nền từ cửa sổ nếu buổi sáng sáng tốt
- Không thay đổi điều kiện ánh sáng giữa chừng

**Camera:**

- Đặt cố định **trên màn hình**, giữa, ngang tầm mắt hoặc cao hơn 5cm
- Khoảng cách mặt–màn hình: **55–65cm**, đo bằng thước
- Không thay đổi vị trí camera sau khi calibrate

**Tư thế:**

- Ngồi thẳng tự nhiên, đầu nhìn thẳng vào màn hình
- **Không cần cố định đầu** — L2CS-Net xử lý head pose, nhưng tránh nghiêng đầu nhiều khi dùng

### 3.2 — Quy trình calibration

**Grid layout (4×3 = 12 điểm):**

```
[1]─────────[2]─────────[3]─────────[4]
 │                                   │
[5]─────────[6]─────────[7]─────────[8]
 │                                   │
[9]────────[10]────────[11]────────[12]
```

Ưu tiên 4×3 thay vì 3×3 vì:

- Thêm điểm ở rìa màn hình giúp Polynomial Regression extrapolate chính xác hơn
- Phủ được 4 góc màn hình tốt hơn

**Quy trình từng điểm:**

1. Hiện target điểm (vòng tròn đỏ + crosshair)
2. Chờ **1.2 giây** (người dùng di chuyển mắt đến điểm)
3. Hiện countdown nhỏ (0.5s) để báo sắp thu
4. Thu **20 frame liên tiếp** (~0.67s ở 30fps)
5. Lấy **median** của 20 frame cho (yaw, pitch)
6. Chuyển điểm tiếp theo

**Lặp lại toàn bộ grid 3 lần** → 36 sample pairs → gộp lại để fit model

### 3.3 — Lưu calibration data

```json
// calibration/calibration_data.json
{
  "screen_resolution": [1920, 1080],
  "camera_distance_cm": 60,
  "timestamp": "2024-01-15T10:30:00",
  "samples": [
    {
      "screen_x": 240,
      "screen_y": 180,
      "gaze_yaw": -28.4,
      "gaze_pitch": -12.1,
      "n_frames": 20
    }
  ]
}
```

Lưu raw data riêng để có thể **re-fit** model mà không cần calibrate lại.

---

## Phase 4 — Calibration Mapper

### 4.1 — Fit Polynomial Regression

**Lý do dùng Polynomial bậc 2:**

- Bậc 1 (linear) không đủ vì mắt nhìn theo đường cong, không thẳng
- Bậc 3 dễ bị overfit với ít data điểm
- Bậc 2 là điểm cân bằng tốt nhất với 36 sample points

**Pipeline:**

```
(yaw, pitch) → PolynomialFeatures(degree=2) → [1, y, p, y², yp, p²] → Ridge Regression → (screen_x, screen_y)
```

Fit **hai model riêng biệt**: một cho `screen_x`, một cho `screen_y`

**Tại sao dùng Ridge thay vì Linear?**

- Ridge thêm L2 regularization, giúp tránh overfitting ở các điểm rìa màn hình
- Tham số `alpha=1.0` là mặc định ổn, có thể tune sau

### 4.2 — Validate Calibration Model

Sau khi fit, đánh giá trên **held-out set** (để lại 4 điểm không train):

| Metric      | Công thức          | Tiêu chí đạt       |
| ----------- | ------------------ | ------------------ | --- | ---------------------------- |
| MAE (pixel) | `mean(             | predicted - actual | )`  | < 80px (≈ 4% chiều rộng FHD) |
| Max Error   | `max(              | predicted - actual | )`  | < 150px                      |
| R² score    | sklearn `r2_score` | > 0.92             |

**Nếu không đạt:**

- Kiểm tra lại điều kiện ánh sáng khi thu data
- Thu thêm 2 lần nữa (tổng 5 lần thay vì 3)
- Xem xét tăng polynomial degree lên 3 nếu R² < 0.85

### 4.3 — Lưu và load model

- Dùng `joblib.dump()` để serialize calibrator
- Load lại khi mở app, không cần calibrate mỗi lần
- Thêm **timestamp** vào file để biết khi nào cần recalibrate (khuyến nghị: 1 tuần hoặc khi đổi vị trí camera)

---

## Phase 5 — Gaze Smoother

### 5.1 — Exponential Moving Average (EMA)

```
smoothed[t] = α × raw[t] + (1-α) × smoothed[t-1]
```

- `α = 0.25`: cursor mượt nhưng có ~2-3 frame lag
- `α = 0.4`: cursor responsive hơn, hơi rung
- Bắt đầu với `α = 0.25`, điều chỉnh theo cảm nhận thực tế

### 5.2 — Outlier Rejection

**Lý do cần:** L2CS-Net đôi khi cho output sai lệch lớn 1 frame khi ánh sáng thay đổi đột ngột hoặc bị che khuất.

**Cơ chế:**

1. Giữ rolling window 7 frame gần nhất
2. Tính median của window → `median_x, median_y`
3. Nếu điểm mới lệch > threshold (250px ngang, 180px dọc) so với median → **bỏ qua frame này**
4. Dùng giá trị EMA trước đó thay thế

### 5.3 — Dead Zone

**Lý do cần:** Cursor không nên rung khi người dùng đang nhìn cố định vào một điểm.

**Cơ chế:**

- Nếu `|new_x - current_x| < 8px` AND `|new_y - current_y| < 8px` → **không di chuyển cursor**
- Dead zone phù hợp với foveal vision (~2° góc nhìn)

### 5.4 — Đánh giá Smoother

Dùng bài test **target tracking:**

1. Hiện một điểm di chuyển chậm theo đường thẳng ngang
2. Người dùng nhìn theo điểm đó
3. Ghi lại trajectory của cursor

| Metric                                  | Tiêu chí đạt                |
| --------------------------------------- | --------------------------- |
| Jitter (độ lệch chuẩn khi nhìn cố định) | < 15px                      |
| Lag (khoảng cách giữa target và cursor) | < 80px ở tốc độ bình thường |
| Outlier slip-through                    | < 1 lần / phút              |

---

## Phase 6 — Tích hợp và Main Loop

### 6.1 — Thread Architecture

**Không chạy tất cả trong 1 thread** — sẽ bị bottleneck:

```
Thread 1 (Camera Thread):
  - Capture frame từ webcam
  - Đưa vào shared Queue (maxsize=2, drop frame cũ nếu full)

Thread 2 (Processing Thread):
  - Lấy frame từ Queue
  - Chạy MediaPipe (EAR)
  - Chạy L2CS-Net (yaw, pitch)
  - Chạy Calibration Mapper
  - Chạy Smoother
  - Cập nhật shared state

Thread 3 (Mouse Control Thread — 60Hz):
  - Đọc shared state
  - Gọi pyautogui.moveTo()
  - Xử lý blink click với cooldown
```

**Lý do:** L2CS-Net inference ~20-30ms, pyautogui call ~1-2ms — tách thread giúp mouse vẫn update đều đặn ngay cả khi inference chậm.

### 6.2 — State Management

```python
# Shared state (dùng threading.Lock để thread-safe)
shared_state = {
    "cursor_x": 960,
    "cursor_y": 540,
    "blink_state": "none",   # "none" | "short" | "long"
    "face_detected": True,
    "fps": 0.0
}
```

### 6.3 — Fallback khi không detect được mặt

- Nếu MediaPipe/L2CS không detect face trong **10 frame liên tiếp** → dừng di chuyển cursor
- Hiện indicator nhỏ ở góc màn hình (màu đỏ = mất tracking)
- Cursor **giữ nguyên vị trí** thay vì nhảy về góc

### 6.4 — Overlay Debug UI

Trong quá trình phát triển, hiện overlay bằng OpenCV:

- EAR value real-time (trái/phải)
- Yaw, Pitch values
- Mapped screen coordinates (trước và sau smoothing)
- FPS counter
- Blink state indicator

---

## Phase 7 — Đánh giá Toàn Hệ Thống

### 7.1 — Accuracy Test (Độ chính xác)

**Phương pháp — Fitts' Law Grid Test:**

1. Hiện 12 target điểm tuần tự (cùng grid calibration)
2. Người dùng nhìn vào từng điểm, giữ 2s
3. Ghi lại vị trí cursor tại thời điểm đó
4. Tính offset so với target thực

```
Chạy test này TRƯỚC và SAU khi calibrate để so sánh
```

| Metric                    | Công thức                         | Mục tiêu |
| ------------------------- | --------------------------------- | -------- |
| Mean Absolute Error (MAE) | `mean(sqrt((cx-tx)² + (cy-ty)²))` | < 80px   |
| 90th percentile error     | `np.percentile(errors, 90)`       | < 150px  |
| Corner accuracy           | MAE riêng cho 4 góc màn hình      | < 120px  |
| Center accuracy           | MAE riêng cho điểm trung tâm      | < 50px   |

**Ghi kết quả vào file để track cải thiện theo thời gian.**

### 7.2 — Latency Test (Độ trễ)

**Phương pháp:**

1. Hiện target đột ngột ở vị trí mới
2. Người dùng nhìn nhanh vào target
3. Đo thời gian từ khi target hiện đến khi cursor đến gần target (< 50px)

| Metric             | Mục tiêu | Ghi chú             |
| ------------------ | -------- | ------------------- |
| End-to-end latency | < 200ms  | Cảm giác responsive |
| Camera capture lag | < 33ms   | 1 frame ở 30fps     |
| Inference time     | < 30ms   | L2CS-Net trên 3050  |
| Smoothing lag      | < 100ms  | Phụ thuộc alpha     |

### 7.3 — Usability Test (Khả năng dùng được)

**Bài test thực tế — Thực hiện mỗi bài 5 lần:**

| Bài test                     | Cách thực hiện         | Tiêu chí đạt                           |
| ---------------------------- | ---------------------- | -------------------------------------- |
| Click vào nút lớn (200×50px) | Nhìn vào nút, chớp mắt | ≥ 4/5 thành công                       |
| Click vào icon (48×48px)     | Nhìn vào icon taskbar  | ≥ 3/5 thành công                       |
| Scroll (nếu đã implement)    | Nhắm mắt phải lâu      | ≥ 4/5 trigger đúng                     |
| Độ bền 5 phút                | Dùng liên tục 5 phút   | Không mỏi mắt quá mức, < 5 false click |

### 7.4 — Performance Benchmarks

| Resource     | Cách đo                    | Mục tiêu          |
| ------------ | -------------------------- | ----------------- |
| FPS xử lý    | FPS counter trong overlay  | ≥ 25fps           |
| GPU VRAM     | `nvidia-smi` lúc chạy      | < 2.8GB           |
| CPU usage    | `htop`                     | < 40% single core |
| RAM          | `htop`                     | < 500MB           |
| Startup time | Thời gian từ run đến ready | < 5 giây          |

---

## Phase 8 — Tối ưu và Cải thiện

### 8.1 — Nếu accuracy kém (MAE > 80px)

1. **Kiểm tra điều kiện ánh sáng** — đây là nguyên nhân phổ biến nhất
2. **Thu lại calibration data** với nhiều lần hơn (5 lần thay vì 3)
3. **Thêm điểm calibration** — thử grid 4×4 (16 điểm)
4. **Kiểm tra vị trí camera** — phải thẳng, không nghiêng

### 8.2 — Nếu cursor rung nhiều

1. Giảm `ema_alpha` xuống 0.15
2. Tăng `dead_zone_px` lên 12-15px
3. Tăng `outlier_threshold` để bộ lọc aggressive hơn

### 8.3 — Nếu latency cao (> 200ms)

1. Kiểm tra camera FPS thực tế: `cap.get(cv2.CAP_PROP_FPS)`
2. Giảm resolution input của L2CS-Net
3. Đảm bảo camera thread và processing thread thực sự song song
4. Profile bằng `cProfile` để tìm điểm nghẽn

### 8.4 — Recalibration Strategy

**Khi nào cần recalibrate:**

- Thay đổi vị trí ngồi hoặc camera
- Sau 1 tuần sử dụng (mỏi mắt ảnh hưởng EAR threshold)
- Khi thấy cursor liên tục lệch về một phía

**Quick recalibration (5 điểm):**

- Implement tùy chọn calibrate nhanh chỉ 5 điểm (4 góc + trung tâm)
- Fit lại mapper với 5 điểm mới, giữ nguyên các điểm cũ với weight thấp hơn

---

## Checklist Hoàn Thành

### Phase 0 — Môi trường

- [x] Cài đặt đủ dependencies, không conflict version
- [x] CUDA hoạt động, inference demo pass
- [x] Cấu trúc thư mục tạo xong

### Phase 1 — Blink Detection

- [x] EAR tính đúng với MediaPipe landmark index
- [x] Phân biệt short/long blink đúng
- [x] Cooldown hoạt động, không double-click
- [ ] Pass tất cả test cases ở 1.3

### Phase 2 — Gaze Estimation

- [x] L2CS-Net inference < 33ms
- [x] VRAM < 2.5GB
- [x] Xử lý được trường hợp không detect face

### Phase 3–4 — Calibration

- [x] Thu đủ data (3 lần × 12 điểm)
- [ ] MAE validation < 80px
- [ ] R² > 0.92
- [ ] Lưu/load model hoạt động

### Phase 5 — Smoother

- [ ] Jitter < 15px khi nhìn cố định
- [ ] Lag chấp nhận được ở tốc độ di chuyển mắt bình thường
- [ ] Dead zone hoạt động đúng

### Phase 6 — Tích hợp

- [ ] 3-thread architecture hoạt động ổn định
- [ ] Không crash sau 10 phút chạy liên tục
- [ ] Fallback khi mất face detection

### Phase 7 — Evaluation

- [ ] Accuracy Test: MAE < 80px
- [ ] Latency: < 200ms end-to-end
- [ ] Usability: Click nút lớn ≥ 4/5
- [ ] Performance: ≥ 25fps, < 2.8GB VRAM

---

## Bảng theo dõi tiến độ

| Phase                    | Ngày bắt đầu | Ngày kết thúc | Trạng thái | Ghi chú                                                           |
| ------------------------ | ------------ | ------------- | ---------- | ----------------------------------------------------------------- |
| 0 — Môi trường           |              |               | ✅         | Hoàn tất cài requirements và tải l2cs weights                     |
| 1 — Blink Detection      |              |               | ✅         | Code ở `src/blink_detector.py` và `facial_video_landmark.py`      |
| 2 — Gaze Estimation      |              |               | ✅         | Code tại `src/gaze_estimator.py`                                  |
| 3 — Thu Calibration Data |              |               | ✅         | Code tại `src/calibration.py` và `calibration/DATA_COLLECTION.md` |
| 4 — Calibration Mapper   |              |               | ⬜         |                                                                   |
| 5 — Smoother             |              |               | ⬜         |                                                                   |
| 6 — Tích hợp             |              |               | ⬜         |                                                                   |
| 7 — Evaluation           |              |               | ⬜         |                                                                   |
| 8 — Tối ưu               |              |               | ⬜         |                                                                   |

---

## Web Migration Checklist (Next.js + NestJS, 2026)

### Milestone A — Core Runtime trên trình duyệt

- [ ] Chạy camera stream ổn định 30-60 FPS (MediaPipe JS + WebGPU backend).
- [ ] Port EAR + blink FSM 1:1 từ bản Python.
- [ ] Lock ngưỡng blink theo profile người dùng (adaptive threshold là tùy chọn nâng cao).

**Điều kiện pass Milestone A:**

- [ ] Tương đương kết quả TC-1..TC-5 của bản Python trong điều kiện ánh sáng tương đương.

### Milestone B — Gaze Mapping usable

- [ ] Fit Polynomial Regression bậc 2 từ dữ liệu calibration.
- [ ] Suy luận tọa độ màn hình realtime từ (yaw, pitch).
- [ ] Áp dụng smoothing (EMA + outlier + dead zone).

**Điều kiện pass Milestone B:**

- [ ] MAE < 100px trên bộ điểm kiểm tra.
- [ ] Jitter < 20px khi nhìn cố định 10 giây.

### Milestone C — Backend và vòng đời model

- [ ] API NestJS cho profile, calibration sessions, model metadata.
- [ ] PostgreSQL schema có version cho calibration/model artifacts.
- [ ] Cơ chế tải lại calibration/model theo user, không bắt calibrate lại mỗi lần đăng nhập.

**Điều kiện pass Milestone C:**

- [ ] Đăng xuất/đăng nhập lại vẫn giữ chính xác mapping trong sai số mục tiêu.

### Milestone D — Morse Engine (tùy chọn theo scope sản phẩm)

- [ ] Đặc tả rõ grammar blink sequence (dot/dash/separator/timeout).
- [ ] FSM parser và bộ test chuỗi chuẩn.

**Điều kiện pass Milestone D:**

- [ ] Tỉ lệ decode đúng >= 95% trên tập câu lệnh kiểm thử.

---

## Release Readiness Checklist (MVP Web)

### A. Readiness về ngưỡng và tài liệu

- [ ] Không còn lệch số threshold giữa code chạy thực tế và tài liệu test.
- [ ] Có mục ghi rõ nguồn sự thật hiện tại (runtime hoặc config) cho từng phase.

### B. Readiness về chức năng cốt lõi

- [ ] Blink detection pass TC-1..TC-5 trong ít nhất 2 lần chạy độc lập.
- [ ] Calibration mapper chạy đủ vòng: collect -> fit -> infer -> persist -> reload.
- [ ] Smoother giảm jitter nhưng không vượt ngưỡng latency mục tiêu.

### C. Readiness về vận hành

- [ ] Có fallback khi mất tracking (freeze cursor + recover an toàn).
- [ ] Có định nghĩa schema/version cho calibration và model artifacts.
- [ ] Có checklist rollback khi mô hình cá nhân hóa gây giảm chất lượng.

---

_Tài liệu này dành cho Giải pháp A (L2CS-Net + Calibration Layer). Sau khi hoàn thành, có thể chuyển sang Giải pháp B (Fine-tune) bằng cách dùng data thu được ở Phase 3 làm điểm khởi đầu._
