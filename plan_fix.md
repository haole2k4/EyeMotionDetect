# Phân tích kỹ thuật hệ thống Web-based Gaze Estimation

Kiến trúc hiện tại có nền tảng toán học và xử lý luồng dữ liệu tốt
(TensorFlow.js, Ridge Regression, EMA, Adaptive EAR). Dưới đây là phân tích
chi tiết từng module theo thứ tự ưu tiên xử lý.

---

## 1. Module Trích xuất đặc trưng (Feature Extraction)

**Thuật toán đang dùng:**
Normalize tọa độ iris theo inner/outer canthus và eyelid margin. Head pose từ
`facialTransformationMatrixes` → Euler angles. EAR từ 6 landmark points.

**Vấn đề:**
- Ánh sáng yếu → iris detection nhiễu → `normalizeIris` tạo giá trị nhảy vọt.
- Góc Yaw/Pitch cực lớn → self-occlusion → chia cho range cực nhỏ, dù đã
  chặn tại `0.5` vẫn gây đứt gãy tín hiệu.

**Đề xuất:**
Khi `range < 0.001` (mắt bị khuất), thay vì fallback cứng về `0.5`, dùng
**constant-velocity Kalman filter** (state vector = `[x, y, vx, vy]`) để
extrapolate vị trí iris từ vận tốc frame trước. Kết hợp thêm cờ `isOccluded`
để các module downstream biết mà giảm trọng số.

---

## 2. Module Hiệu chuẩn (Calibration — 12 điểm)

**Thuật toán đang dùng:**
`STABLE_WAIT_MS = 1200ms`, 25 frames/điểm, `vectorMedian` để loại outlier,
bỏ frame nếu `EAR < 0.18`.

**Vấn đề:**
- EAR threshold cứng `0.18` gây lỗi với người mắt hí (EAR bình thường
  ~0.19–0.20).
- 12 điểm hiển thị tuần tự → người dùng mất tập trung ở nửa sau.

**Đề xuất:**
- Thay `EAR < 0.18` bằng `EAR < baselineEAR * 0.75`
  (tái dùng `AdaptiveEARDetector`).
- Random hóa thứ tự hiển thị điểm calibration để tránh eye-anticipation drift.

---

## 3. Module Ánh xạ tọa độ (MLP vs Polynomial)

**Thuật toán đang dùng:**
Input 7D (4 iris + 3 head angles). MLP: 2 hidden layers (32→16), L2 +
Dropout(0.1), early stopping tại MAE < 40px. Polynomial: Ridge Regression
(λ=0.01), expand 7D → 20D.

**Vấn đề:**
- Polynomial bậc 2 extrapolate kém ở biên màn hình lớn → chuột bị văng.
- MLP scale output theo viewport fraction → sai lệch khi đổi màn hình.

**Đề xuất:**
- Màn hình lớn nên ưu tiên MLP.
- Thay hard clamp bằng **soft clamp** (sigmoid-based):
```
  softclamp(x) = W * sigmoid((x / W) * 6 - 3)
```

  Với `W` = viewport width/height tương ứng. Tránh hiện tượng chuột "treo
  cứng" ở biên thay vì văng ra ngoài.
- Lưu thêm `{ screenWidth, screenHeight, aspectRatio }` vào calibration data
  để detect khi người dùng đổi màn hình.

---

## 4. Module Làm mượt (Smoother & Jitter Reduction)

**Thuật toán đang dùng:**
EMA `alpha=0.08`, deadzone = 5px, Median 7 frames, reject jump > 250px (X) /
180px (Y).

**Vấn đề:**
- **Saccade bị nhầm là outlier:** Liếc mắt nhanh (saccadic movement) nhảy
  > 250px → bị reject → chuột đóng băng.
- **Alpha cố định:** `alpha=0.08` gây latency cao, chuột phản hồi chậm khi
  di chuyển nhanh.

**Đề xuất (ưu tiên cao nhất):**
Thay EMA bằng **1 Euro Filter** với hyperparameters khởi điểm:

| Tham số      | Giá trị |
|--------------|---------|
| `min_cutoff` | `1.0`   |
| `beta`       | `0.007` |
| `d_cutoff`   | `1.0`   |

Filter này tự động tăng alpha khi vận tốc cao (saccade → phản hồi ngay lập
tức), giảm alpha khi vận tốc thấp (fixation → mượt, không rung). Giải quyết
đồng thời cả hai vấn đề trên mà không cần tuning riêng biệt.

---

## 5. Module Nhận diện hành động (EAR Detector & Mouse Controller)

**Thuật toán đang dùng:**
Adaptive baseline EAR (90 frames history), ngưỡng kích hoạt 60% baseline.
Left click = nháy trái 80–500ms trong khi phải mở. Drag = nhắm cả hai
> 450ms, lệch < 180ms.

**Vấn đề:**
- ~30% người dùng không thể wink độc lập → click không kích hoạt được.
- Chớp mắt tự nhiên (100–150ms) có thể trigger click nếu hai mắt lệch > 80ms.

**Đề xuất:**
- Bổ sung **Dwell-Time Click** như một chế độ tùy chọn (không thay thế blink-
  click): nếu tọa độ gaze nằm trong bán kính 15px liên tục ≥ 800ms → trigger
  left click. UX tốt hơn cho người dùng không wink được.
- Reset `WebCursorController` state khi detect DOM mutation lớn để tránh
  cursor lag khỏi main thread.

---

## Thứ tự ưu tiên triển khai

| # | Fix | Lý do |
|---|-----|-------|
| 1 | **1 Euro Filter** | Impact lớn nhất — giải quyết saccade + latency cùng lúc |
| 2 | **Dwell-Time Click** | Mở rộng khả năng tiếp cận cho nhiều người dùng hơn |
| 3 | **Dynamic blink threshold** (`baselineEAR * 0.75`) | Loại bỏ false-negative trên mắt hí |
| 4 | **Soft clamp** | Hành vi biên tự nhiên hơn hard clamp |
| 5 | **Kalman filter cho iris occlusion** | Edge case, chỉ ảnh hưởng khi quay đầu cực độ |