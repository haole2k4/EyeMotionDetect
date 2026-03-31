# EyeMotionDetect (Web Edition)

Điều khiển chuột máy tính bằng cử động mắt hoàn toàn trên trình duyệt, sử dụng **MediaPipe Tasks Vision** để phát hiện nháy mắt (EAR), trích xuất đặc trưng khuôn mặt (Landmarks, Head Pose, Iris), kết hợp với các mô hình Machine Learning (Polynomial Regression / MLP Deep Learning) để ước lượng và điều hướng tọa độ màn hình. 

Dự án đã được chuyển đổi sang kiến trúc **Monorepo (Turborepo)** chạy hoàn toàn bằng TypeScript, bao gồm hệ thống Edge-AI suy luận trực tiếp ở frontend và backend để cá nhân hóa dữ liệu.

## Kiến trúc Hệ thống (Hybrid Edge-AI 2026)

- **Frontend (Edge Computation):** Xây dựng bằng Next.js 15, MediaPipe Face Landmarker, cấu hình Web Workers, và TensorFlow.js (WebGPU backend). Mọi tác vụ suy luận thời gian thực (realtime inference) đều chạy nội bộ trên trình duyệt của người dùng với độ trễ tối thiểu (< 150ms).
- **Backend (Data & Personalization):** Xây dựng bằng NestJS 11 kết hợp PostgreSQL. Chịu trách nhiệm quản lý tài khoản người dùng, lưu trữ lịch sử tinh chỉnh (calibration), cấu hình nháy mắt, và model weights (tọa độ mapper) cho từng người dùng riêng biệt.
- **Monorepo:** Quản lý mã nguồn tập trung bằng `pnpm` workspaces và `turborepo`.

## Cấu trúc Dự án

```text
EyeMotionDetect/
├── apps/
│   ├── api/            # Backend NestJS (REST API, TypeORM, Auth, Profiles, Weights DB)
│   └── web/            # Frontend Next.js (MediaPipe, TF.js, UI, Calibration)
├── packages/
│   └── shared-types/   # (Dự kiến) Shared types dùng chung cho cả frontend/backend
├── docker-compose.dev.yml # Docker compose khởi tạo PostgreSQL dev
├── pnpm-workspace.yaml
└── turbo.json
```

## Yêu cầu Hệ thống

- **Node.js**: `v22.14.0+`
- **Package Manager**: `pnpm v9.15.4+` (kèm hệ thống cache Turborepo)
- **Cơ sở dữ liệu**: Đã cài đặt [Docker](https://www.docker.com/) (dành cho PostgreSQL container)
- **Trình duyệt**: Hỗ trợ chuẩn AI WebGPU mới nhất (Chrome 121+ / Edge 121+).

---

## Hướng dẫn Thiết lập & Khởi chạy

Để máy tính của bạn tự động chạy được hệ thống, vui lòng thực hiện tuần tự các bước dưới đây:

### Bước 0: Chuẩn bị Môi trường (Prerequisites)
- Máy đã cài đặt **Node.js**: Phiên bản tối thiểu `v22.14.0`.
- Cài đặt **pnpm** (Package manager chính của dự án):
  ```bash
  npm install -g pnpm@9.15.4
  ```
- Máy tính đã cài đặt **Docker Desktop** (hoặc trình giả lập daemon container tương đương).

### Bước 1: Cài đặt Dependencies

Mở bash/terminal, clone project theo địa chỉ repository hiện tại và cài đặt các phụ thuộc (dependencies) xuyên suốt toàn bộ workspace:

```bash
git clone git@github.com:haole2k4/EyeMotionDetect.git
cd EyeMotionDetect

# Tải và build cache các thư viện thông qua pnpm
pnpm install
```
*(Tiến trình này sẽ động bộ các cài đặt từ module trong `apps/api` cho backend và `apps/web` cho frontend)*

### Bước 2: Khởi tạo Cơ sở Dữ liệu (PostgreSQL)

Mở phần mềm Docker, sau đó khởi chạy server database PostgreSQL từ file thiết lập có sẵn ở thư mục gốc:

```bash
docker compose -f docker-compose.dev.yml up -d
```
> **Thông tin DB**: Container được tạo sẽ tự động chạy ngầm mở port `5432`, với database mặc định: `gaze_dev`, user: `gaze`, pass: `gaze_dev_pass`. Môi trường API Backend Node.js cũng sẽ tự động đọc cấu hình này để liên kết.

*(Tùy chọn) - Nếu bạn sử dụng TypeORM migrations thay vì thẻ `synchronize: true`, bạn cần seed dữ liệu ban đầu cho database:*
```bash
# Tiến hành nạp schema cho Database
cd apps/api
pnpm typeorm migration:run -d src/data-source.ts
cd ../..
```

### Bước 3: Khởi chạy Máy chủ Development

Quay lại vị trí gốc của ứng dụng (thư mục có chứa tệp `turbo.json`), dùng Turborepo để khởi động đồng thời tất cả các client:

```bash
# Lệnh duy nhất tự động chạy dev cả ở Web lẫn API theo turbo config
pnpm run dev
```

Tiến trình khi chạy thành công sẽ mở ra 2 cổng dịch vụ cục bộ:
- **🌐 Trải nghiệm Trực tiếp (Web Client - Giao diện điều khiển)**: Mở trình duyệt tại [http://localhost:3000](http://localhost:3000)
- **⚙️ Backend Service (API Server - Hệ thống Data)**: Các request backend tương tác tại [http://localhost:3001](http://localhost:3001)

> **Lưu ý (Troubleshooting)**: Hãy mở `Developer Console (F12)` trên Chrome và ấn tab *Performance* để xem MediaPipe có đang hoạt động tốt trên WebGPU hay không. Nếu FPS quá thấp, hãy đảm bảo trình duyệt của bạn đang bật tính năng hỗ trợ WebGPU.

---

## Lộ trình Phát triển (Quy hoạch theo `Plan.md`)

Chiến lược triển khai hệ thống Web được chia thành các Phase với chuẩn hoá rõ ràng (Xem chi tiết kỹ thuật trong tệp [Plan.md](./Plan.md)):

* **Phase 0:** Cấu hình Monorepo, WebGPU check, NestJS & Next.js khởi tạo dự án.
* **Phase 1:** Triển khai Database Schema & API Foundation (Lưu trữ và phục hồi MLP weights/Polynomial coeffs cá nhân).
* **Phase 2:** Tích hợp MediaPipe Integration & Feature Extraction (FaceLandmarker, Iris Normalization, ma trận góc Face Pose). Xây dựng cơ chế động phân tích Tỷ lệ nháy mắt (Adaptive EAR).
* **Phase 3:** Trải nghiệm lưới điểm Calibration (Polynomial Regression) cho cá nhân. Thu thập chắt lọc (median buffer) tiến tới fit mô hình hồi quy.
* **Phase 4:** Huấn luyện mô hình cá nhân hóa bằng ML (TF.js MLP Model), train ngay tại phía Edge Client dựa trên mẫu dữ liệu thu được sau hiệu chuẩn, đẩy trọng số về server lưu trữ.
* **Phase 5:** Bộ lọc Gaze Smoother (giảm nhiễu điểm nhìn) bằng các thuật toán như kỹ thuật EMA, 1€ Filter triệt để triệt tiêu tín hiệu Jitter và Outlier noise.
* **Phase 6:** Đưa vòng lặp suy luận thị giác vào background Worker, giải phóng LUỒNG MÀN HÌNH CHÍNH (main thread) của trình duyệt. Tối ưu khung hình FPS.

> *Lưu ý: Dự kiến phiên bản Web loại bỏ hoàn toàn Python để tăng mức độ liền mạch sản phẩm cho các users phổ thông.*
