# EyeMotionDetect

Điều khiển chuột máy tính bằng cử động mắt, sử dụng **MediaPipe Face Mesh** để phát hiện nháy mắt (EAR) và **L2CS-Net** để ước lượng hướng nhìn.

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

| Tham số | Mặc định | Ý nghĩa |
|---------|----------|---------|
| `blink_threshold` | 0.21 | EAR dưới mức này = đang nhắm |
| `short_blink_min_ms` | 250 | Ngưỡng tối thiểu để nhận chớp có chủ ý |
| `short_blink_max_ms` | 400 | Giới hạn trên của click trái |
| `long_blink_min_ms` | 600 | Ngưỡng dưới của click phải |
| `consecutive_frames` | 3 | Số frame liên tiếp để xác nhận blink |