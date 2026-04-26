# EyeMotionDetect (Web Edition)

Hệ thống điều khiển giao diện trắc nghiệm (MCQ 4 lựa chọn) bằng cử động mắt hoàn toàn trên trình duyệt, sử dụng **MediaPipe Tasks Vision** để trích xuất đặc trưng khuôn mặt (Landmarks, Head Pose, Iris), kết hợp với mô hình Machine Learning (Polynomial Regression) để xác định vùng nhìn và tự động chọn đáp án qua cơ chế **Dwell-time**.

Dự án đã được chuyển đổi sang kiến trúc **Monorepo (Turborepo)** chạy hoàn toàn bằng TypeScript, bao gồm hệ thống Edge-AI suy luận trực tiếp ở frontend và backend PostgreSQL để quản lý tài khoản người dùng và cá nhân hóa dữ liệu.

## Tính năng nổi bật

- **Chế độ dạng lưới (Grid Mode):** Giao diện được chia thành dạng lưới 3x3 (9 phân vùng) trên màn hình, hỗ trợ điều hướng và tương tác đa điểm.
- **Hiệu chuẩn (Calibration) 9 điểm:** Quy trình huấn luyện với 9 vị trí trên màn hình, sử dụng Grid Mapper để chuyển đổi tọa độ điểm nhìn thành các ô lưới tương ứng với độ chính xác cao.
- **Chọn đáp án bằng Dwell-time:** Khắc phục lỗi nháy mắt vô tình (blink-to-click) bằng cách đếm thời gian nhìn liên tục (1.5s - 2.0s) vào một ô thông qua Dwell-time State Machine tiến tiến. Có tính năng Deadzone ở trung tâm để tránh chọn nhầm.

## Kiến trúc Hệ thống (Hybrid Edge-AI 2026)

- **Frontend (Edge Computation):** Xây dựng bằng Next.js 15, MediaPipe Face Landmarker, cấu hình Web Workers, và TensorFlow.js. Mọi tác vụ suy luận thời gian thực (realtime inference) đều chạy nội bộ trên trình duyệt với độ trễ tối thiểu (< 150ms) bằng WebGPU.
- **Backend (Data & Personalization):** Xây dựng bằng NestJS 11 kết hợp PostgreSQL. Chịu trách nhiệm quản lý tài khoản người dùng, lưu trữ trọng số hiệu ứng cá nhân hóa và quản trị tự động qua Auth JWT.
- **Monorepo:** Quản lý mã nguồn tập trung bằng `pnpm` workspaces và quy trình build từ `turborepo`.

## Cấu trúc Dự án

```text
EyeMotionDetect/
├── apps/
│   ├── api/            # Backend NestJS (REST API, TypeORM, Auth, DB)
│   └── web/            # Frontend Next.js (MediaPipe, TF.js, UI, Calibration Grid 3x3)
├── packages/
│   └── shared-types/   # Shared types dùng chung cho cả frontend/backend
├── docs/               # Tài liệu kỹ thuật chi tiết
├── docker-compose.dev.yml
├── pnpm-workspace.yaml
└── turbo.json
```

## Yêu cầu Hệ thống

- **Node.js**: `v22.14.0+`
- **Package Manager**: `pnpm v10.18.2+`
- **Cơ sở dữ liệu**: Đã cài đặt [Docker Desktop](https://www.docker.com/) (dành cho PostgreSQL + pgAdmin4)
- **Trình duyệt**: Hỗ trợ chuẩn AI WebGPU mới nhất (Chrome 121+ / Edge 121+).

---

## Hướng dẫn Thiết lập & Khởi chạy

### Bước 1: Chuẩn bị Môi trường

Mở Terminal/Bash, tải repository về máy và cài đặt toàn bộ dependencies qua pnpm:

```bash
git clone git@github.com:haole2k4/EyeMotionDetect.git
cd EyeMotionDetect
npm install -g pnpm@10.18.2
pnpm install
```

### Bước 2: Khởi tạo Cơ sở Dữ liệu (PostgreSQL)

Hãy chắc chắn bạn đã bật Docker Desktop, sau đó khởi chạy cả môi trường DB và môi trường quản trị:

```bash
docker compose -f docker-compose.dev.yml up -d
```

- **Container Database**: Port `5432` | DB mặc định: `gaze_dev` | User: `gaze` | Pass: `gaze_dev_pass`.
- **Giao diện pgAdmin4**: Truy cập `http://localhost:5050` | Email: `admin@eyemotiondetect.dev` | Pass: `admin123456`.
- **Tài khoản Admin App**: Ngay khi backend lên, hệ thống cấp sẵn tài khoản cho admin (Email: `admin@eyemotiondetect.dev` | Pass: `admin`).

*(Trường hợp container bị tắt, dùng lệnh `docker start eyemotiondetect eyemotiondetect-pgadmin` để bật lại)*.

### Bước 3: Khởi chạy Máy chủ Development

Tại vị trí chứa file thư mục gốc của project, gửi lệnh qua Turborepo để bật đồng thời frontend Web UI và NextJS API:

```bash
pnpm run dev
```

Hệ thống bật tại 2 dịch vụ nội bộ:
- **🌐 Trải nghiệm Trực tiếp (Web GUI MCQ Mode)**: [http://localhost:3000](http://localhost:3000)
- **⚙️ Backend API Server (Database Services)**: [http://localhost:3001](http://localhost:3001)

> **Troubleshooting MediaPipe**: Hãy mở `Developer Console (F12)` trên Chrome, kiểm tra xem có bất kỳ lỗi giới hạn tài nguyên WebGPU nào hay không. Cấp quyền truy cập cho máy tính đầy đủ về Camera trước khi sử dụng ứng dụng.

---

## Tài liệu Hướng dẫn Vận hành & Phát triển

Thiết kế mô hình gốc cũ điều hướng chuột tự do đã được thay thế. Vui lòng đọc các tài liệu cập nhật tại mục [docs](./docs/README.md) để nắm cơ chế mới:

1. **[Backend Dev & Setup](./docs/BACKEND_DEV.md)**: Chi tiết cách tương tác Terminal API, role admin, test users và auto-migration database TypeORM.
2. **[Calibration Guide (Cấu hình 9 điểm)](./docs/CALIBRATION_GUIDE.md)**: Quy trình hiệu chuẩn chi tiết, phân tích độ sai lệch trên 9 khu vực của lưới 3x3.
3. **[Eye Actions Mapping (Chống sai lệch do nháy mắt)](./docs/EYE_ACTIONS_MAPPING.md)**: Cách hoạt động state machine của Dwell-time thay thế hoàn toàn kỹ thuật thao tác nháy mắt (blink gesture) để hạn chế rung giật ngẫu nhiên, có hỗ trợ vùng chết (deadzone) trung tâm.
