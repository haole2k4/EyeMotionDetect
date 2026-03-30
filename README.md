# EyeMotionDetect

Điều khiển chuột máy tính bằng cử động mắt, sử dụng **MediaPipe Face Mesh** để phát hiện nháy mắt (EAR) và **L2CS-Net** để ước lượng hướng nhìn.

## Kiến trúc 2026 (Hybrid Edge-AI)

Hướng phát triển của dự án là kết hợp:

- Suy luận thời gian thực trên máy người dùng (Edge): Face landmarks, blink, gaze, smoothing.
- Tinh chỉnh theo người dùng (Personalization): calibration và lớp refine hướng nhìn.
- Quản trị dữ liệu (Backend): hồ sơ, calibration history, model weights.

### Trạng thái hiện tại (rà soát theo code)

- **Phase 1 — Blink Detection:** gần hoàn tất, đã có EAR + FSM + bộ test TC-1..TC-5.
- **Phase 2 — Gaze Estimation:** có wrapper L2CS-Net, chưa ghép đầy đủ vào vòng điều khiển chuột.
- **Phase 3 — Calibration:** đã có UI thu data 4x3 và lưu JSON/ảnh mặt; chưa fit mapper để suy ra tọa độ màn hình.
- **Phase 4+ (Smoother, control loop, backend):** chưa triển khai đầy đủ.

Đánh giá tổng thể theo scope full-stack hiện tại: khoảng **40%**.

### Phần nên giữ nguyên khi chuyển sang web

1. Logic EAR (công thức Soukupova) và cách tính trung bình 2 mắt.
2. FSM phân loại blink short/long/sustained + cooldown.
3. Quy trình calibration theo lưới 4x3, lấy median nhiều frame mỗi điểm.

### Phần cần bổ sung để đạt bản Web sản phẩm

1. Hoàn thiện Calibration Mapper (Polynomial Regression bậc 2) để map (yaw, pitch) -> (screen_x, screen_y).
2. Hoàn thiện Gaze Smoother (EMA + outlier rejection + dead zone).
3. Hoàn thiện control loop di chuột/click ổn định theo realtime state.
4. Xây backend NestJS + PostgreSQL để lưu profile, calibration, và model artifacts.
5. Bổ sung Morse Code Engine (FSM) nếu mục tiêu điều khiển bằng chuỗi blink.

### Ghi chú quan trọng

- `polynomial_degree: 2` đã có trong cấu hình, nhưng mapper chưa phải là luồng chạy hoàn chỉnh trong code hiện tại.
- Calibration hiện đang ở mức thu dữ liệu tốt, chưa có bước fit model + load lại phiên sau như production requirement.

### Single Source of Truth cho Blink Thresholds

Để tránh lệch giữa code và tài liệu, dự án tạm thời dùng quy ước sau:

1. **Nguồn sự thật cho đánh giá runtime hiện tại:** `src/blink_detector.py` (vì demo/evaluation đang khởi tạo trực tiếp `BlinkDetector()`).
2. **`config/settings.yaml` là nguồn cấu hình mục tiêu:** sẽ thành nguồn sự thật chính khi pipeline đọc config đầy đủ.
3. **Khi có lệch số giữa runtime và config:** test pass/fail ở giai đoạn hiện tại bám theo runtime thực thi.

| Tham số              | Runtime hiện tại (`src/blink_detector.py`) | Config hiện tại (`config/settings.yaml`) |
| -------------------- | ------------------------------------------ | ---------------------------------------- |
| `blink_threshold`    | 0.21                                       | 0.21                                     |
| `short_blink_min_ms` | 120                                        | 250                                      |
| `short_blink_max_ms` | 400                                        | 400                                      |
| `long_blink_min_ms`  | 600                                        | 600                                      |
| `long_blink_max_ms`  | 2000                                       | _(chưa khai báo)_                        |
| `cooldown_ms`        | 600                                        | _(chưa khai báo)_                        |
| `consecutive_frames` | 3                                          | 3                                        |

---

## Yêu cầu

- Python **3.12**
- GPU NVIDIA (khuyến nghị RTX 3050 4GB+), CUDA đã cài sẵn
- Webcam ≥ 720p 30fps

---

## Cài đặt

### 1. Clone repo

```bash
git clone git@github.com:haole2k4/EyeMotionDetect.git
cd EyeMotionDetect
```

### 2. Tạo môi trường ảo và cài thư viện

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Tải mô hình MediaPipe

```bash
wget -O face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
```

### 4. Tải mô hình L2CS-Net

Tải file `L2CSNet_gaze360.pkl` (~100MB) từ [L2CS-Net releases](https://github.com/Ahmednull/L2CS-Net) rồi đặt vào thư mục:

```
models/L2CSNet_gaze360.pkl
```

---

## Chạy

### Kiểm tra blink detector (Phase 1)

```bash
python facial_video_landmark.py
```

### Đánh giá blink detector (Phase 1.3)

```bash
python evaluation/blink_evaluation.py          # Chạy toàn bộ 5 test case
python evaluation/blink_evaluation.py --tc 3   # Chỉ chạy test case cụ thể
```

Nhấn **ESC** hoặc **q** để thoát. Kết quả được lưu tự động vào `evaluation/`.

---

## Cấu trúc thư mục

```
EyeMotionDetect/
├── config/settings.yaml       # Ngưỡng EAR, thông số smoother...
├── models/                    # Đặt file .pkl của L2CS-Net vào đây
├── src/
│   └── blink_detector.py      # Logic EAR + phân loại blink
├── evaluation/
│   ├── blink_evaluation.py    # Script đánh giá Phase 1.3
│   └── TEST_CASES.md          # Mô tả các test case
├── facial_video_landmark.py   # Demo blink detector với webcam
└── requirements.txt
```

---

## Điều chỉnh ngưỡng

Chỉnh tham số trong `config/settings.yaml`:

| Tham số              | Mặc định | Ý nghĩa                               |
| -------------------- | -------- | ------------------------------------- |
| `blink_threshold`    | 0.21     | EAR dưới mức này = đang nhắm          |
| `short_blink_min_ms` | 250      | Chớp NGẮN HƠN ngưỡng này sẽ bị bỏ qua |
| `short_blink_max_ms` | 400      | Giới hạn trên của click trái          |
| `long_blink_min_ms`  | 600      | Ngưỡng dưới của click phải            |
| `consecutive_frames` | 3        | Số frame liên tiếp để xác nhận blink  |

Lưu ý: các ngưỡng ở bảng này là **config file hiện tại**. Trong giai đoạn code hiện tại, runtime của demo/evaluation vẫn dùng default trong `src/blink_detector.py`.

---

## Release Readiness Checklist (pre-Next.js)

### Gate 1 — Logic nhất quán

- [ ] Bảng ngưỡng blink thống nhất giữa runtime và config (không còn drift).
- [ ] Tài liệu test bám đúng ngưỡng đang dùng ở runtime.

### Gate 2 — Chất lượng realtime

- [ ] TC-1..TC-5 pass ổn định trong 2 phiên test độc lập.
- [ ] FPS thực tế >= 25 và không có false click tăng đột biến khi ánh sáng thay đổi nhẹ.

### Gate 3 — Mapping usable

- [ ] Calibration mapper chạy end-to-end (fit + infer + load lại).
- [ ] MAE/Jitter đạt ngưỡng tối thiểu đã chốt trong test plan.

### Gate 4 — Productization tối thiểu

- [ ] Có phương án persistence cho calibration/model theo user.
- [ ] Có fallback rõ ràng khi mất face tracking (cursor freeze + recover).
