# EyeMotionDetect — Nền tảng Thi Trắc nghiệm Trợ năng Điều khiển bằng Mắt (WCAG AAA)

**EyeMotionDetect** là hệ thống điều khiển giao diện thi trắc nghiệm (MCQ 4 lựa chọn) bằng cử động mắt thời gian thực ngay trên trình duyệt (**Edge-AI Gaze Tracking**). Dự án kết hợp **MediaPipe Tasks Vision** với lõi toán học **Rust WebAssembly (`crates/gaze-core`)** và kiến trúc hiển thị **144Hz Zero-Jank**, giúp người khuyết tật vận động chi trên làm bài thi độc lập, chính xác và không mỏi mắt.

---

## Tính năng Nổi bật

- **Lõi Toán học Rust WASM Siêu tốc (`crates/gaze-core`):**
  - **Chuẩn hóa Khóe mắt Giải phẫu Bất biến Góc nghiêng (Roll-Invariant Eye-Corner Basis):** Chiếu tâm 5 điểm mống mắt lên hệ trục trực chuẩn nối hai khóe mắt kết hợp khoảng cách liên mắt (`IOD`), góc nghiêng đầu (`Pitch/Yaw/Roll`) và tọa độ tâm mặt tạo thành **Vector đặc trưng 18 chiều**, giữ tâm nhìn ổn định ngay cả khi nghiêng đầu $\pm 15^\circ$.
  - **Hiệu chuẩn Tức thì bằng Nghiệm đóng Huber IRLS Ridge SVD (< 0.3ms):** Tự động loại bỏ nhiễu ngoại lai (chớp mắt, nhìn lệch) trong quá trình hiệu chuẩn 9 điểm mà không cần mạng nơ-ron nặng nề.
  - **Tự động Bù trôi Ngầm (Implicit Drift Correction):** Liên tục tinh chỉnh vector bù trôi theo tư thế ngồi thực tế của thí sinh thông qua cửa sổ trượt 24 lần xác nhận đáp án gần nhất.
- **Kiến trúc Đa luồng 144Hz Zero-Jank & Con trỏ Từ tính:**
  - Tách biệt hoàn toàn vòng lặp suy luận AI trong Web Worker (**30 FPS**) và vòng lặp giao diện `requestAnimationFrame` (**144Hz**) qua `SharedGazeBuffer`.
  - Kết hợp bộ lọc **1€ Filter 2D**, bộ nội suy lò xo tới hạn (**Critically-Damped Spring Interpolator**) và lực hút từ tính (**Magnetic Target Snap**) giúp con trỏ **Soft Spotlight** bám mượt vào các thẻ đáp án A/B/C/D, triệt tiêu rung giật của webcam phổ thông 720p.
- **Hệ thống Cử chỉ Mắt Đa phương thức (An toàn 100%):**
  - **Pitch-Compensated Blink & Dwell-Time:** Chọn đáp án bằng cách giữ ánh nhìn (Dwell) hoặc chớp mắt chủ động có bù góc nhìn xuống (tránh nhận nhầm chớp mắt khi nhìn xuống đáp án C, D).
  - **Saccadic Edge Strokes:** Liếc nhanh ra vùng biên trái/phải màn hình (`< 450ms`) để chuyển câu trước/sau (`PREV` / `NEXT`).
  - **Smooth Pursuit Orbit:** Nút "Nộp bài" yêu cầu mắt nhìn đuổi theo chấm sáng chuyển động tròn (`1.2s`), triệt tiêu hoàn toàn nguy cơ bấm nhầm (0% false-positive) và thay thế toàn bộ hộp thoại `window.confirm` chặn người khuyết tật.
- **Phòng thi Trợ năng Chuẩn WCAG AAA & Quản trị Toàn diện:**
  - Tích hợp **Text-to-Speech (`vi-VN`)** tự động đọc câu hỏi và đáp án khi chuyển câu.
  - **Head Pose & Lighting HUD:** Cảnh báo khi thiếu sáng hoặc ngồi lệch tư thế; **tự động tạm dừng đồng hồ làm bài** khi mất dấu khuôn mặt.
  - Hỗ trợ cấu hình hồ sơ trợ năng cá nhân hóa (`AccessibilityProfile`) và thống kê bản đồ nhiệt ánh nhìn (`GazeHeatmap`) trên trang Quản trị.

---

## Kiến trúc Hệ thống

- **Rust WASM Core (`crates/gaze-core`):** Thư viện Rust độc lập (`no external heavy crates`) đảm nhiệm trích xuất đặc trưng 18D, giải hệ phương trình Huber Ridge SVD, lọc tín hiệu và nhận diện cử chỉ mắt qua giao diện C-ABI / WebAssembly.
- **Frontend (`apps/web`):** Xây dựng bằng **Next.js 15**, **React 19**, **Tailwind CSS v4**, **MediaPipe Face Landmarker** và **Web Workers**. Mọi tác vụ suy luận chạy trực tiếp trên thiết bị người dùng (Edge-AI).
- **Backend (`apps/api`):** Xây dựng bằng **NestJS 11**, **TypeORM** và **PostgreSQL 17**. Quản lý tài khoản JWT, ngân hàng câu hỏi, đề thi, hồ sơ trợ năng (`AccessibilityProfile`), trọng số cá nhân hóa (`GazeWeights`) và dữ liệu bản đồ nhiệt (`GazeHeatmap`).
- **R&D & Evaluation (`evaluation/`):** Bộ công cụ Python & TypeScript dùng để kiểm định độ chính xác (`MAE`, `R²`, độ trễ), huấn luyện trọng số tiên nghiệm và chạy daemon phần cứng tùy chọn.

---

## Cấu trúc Dự án

```text
EyeMotionDetect/
├── crates/
│   └── gaze-core/          # Lõi toán học Rust WASM (18D Features, Huber SVD, Filters, Gestures)
├── apps/
│   ├── api/                # Backend NestJS 11 (REST API, TypeORM, Auth, Accessibility, Exams)
│   └── web/                # Frontend Next.js 15 (144Hz Gaze UI, WCAG AAA Exam HUD, Admin Dashboard)
├── evaluation/             # Bộ công cụ benchmark Python & TypeScript
│   └── artifacts/          # Kết quả benchmark JSON & trọng số pre-trained ONNX/JSON
├── docs/                   # Tài liệu hướng dẫn vận hành & kỹ thuật chi tiết
├── AGENT.md                # Quy chuẩn kỹ thuật & hướng dẫn dành cho AI Agents
├── Cargo.toml              # Cấu hình Rust Workspace
├── docker-compose.dev.yml  # Cấu hình PostgreSQL 17 & pgAdmin4
├── pnpm-workspace.yaml     # Cấu hình pnpm Monorepo
└── turbo.json              # Cấu hình pipeline Turborepo
```

---

## Yêu cầu Hệ thống

- **Node.js**: `v22.14.0+`
- **Package Manager**: `pnpm v10.18.2+`
- **Rust Toolchain** *(nếu biên dịch lại WASM)*: `rustc 1.80+`, target `wasm32-unknown-unknown`
- **Cơ sở dữ liệu**: Docker & Docker Compose (chạy PostgreSQL 17 + pgAdmin4)
- **Trình duyệt**: Chrome 121+ / Edge 121+ / Firefox (hỗ trợ WebAssembly, WebGL/WebGPU và Web Speech API)

---

## Hướng dẫn Thiết lập & Khởi chạy

### Bước 1: Cài đặt Dependencies

```bash
git clone git@github.com:haole2k4/EyeMotionDetect.git
cd EyeMotionDetect
pnpm install
```

### Bước 2: Khởi tạo Cơ sở Dữ liệu (PostgreSQL)

Khởi chạy container PostgreSQL và pgAdmin4 bằng Docker Compose (hoặc dùng script tiện ích `pnpm run docker:up`):

```bash
pnpm run docker:up
# hoặc: docker compose -f docker-compose.dev.yml up -d
```

- **PostgreSQL Database**: Port `5432` | DB: `gaze_dev` | User: `gaze` | Pass: `gaze_dev_pass`
- **Giao diện pgAdmin4**: Truy cập `http://localhost:5050` | Email: `admin@eyemotiondetect.dev` | Pass: `admin123456`
- **Tài khoản Admin mặc định trên Web**: Email: `admin@eyemotiondetect.dev` | Pass: `admin`

### Bước 3: Khởi chạy Máy chủ Development

Tại thư mục gốc của dự án, chạy lệnh:

```bash
pnpm run dev
```

Hệ thống sẽ khởi động đồng thời 2 dịch vụ:
- **Giao diện Web (Next.js 15)**: [http://localhost:3000](http://localhost:3000)
- **Backend API Server (NestJS 11)**: [http://localhost:3001](http://localhost:3001)

### Bước 4 (Tùy chọn): Kiểm thử & Biên dịch lại Rust WASM Core

File binary `apps/web/public/wasm/gaze_core.wasm` đã được biên dịch sẵn. Nếu bạn chỉnh sửa mã nguồn trong `crates/gaze-core`, hãy chạy lệnh tự động:

```bash
pnpm run build:wasm
# hoặc: cargo build --target wasm32-unknown-unknown --release && cp target/wasm32-unknown-unknown/release/gaze_core.wasm apps/web/public/wasm/gaze_core.wasm
```

Để chạy toàn bộ unit tests (NestJS API + Rust cargo test):
```bash
pnpm run test
```

Để chạy bộ benchmark thuật toán Python R&D:
```bash
pnpm run test:eval
# hoặc: python3 evaluation/benchmark_suite.py
```

---

## Tài liệu Tham khảo

- **[AGENT.md](./AGENT.md)**: Kiến trúc lõi, quy ước bộ đệm `SharedGazeBuffer` và các quy tắc bắt buộc khi phát triển.
- **[Danh mục Tài liệu (`docs/README.md`)](./docs/README.md)**:
  1. **[Backend Dev & Setup (`docs/BACKEND_DEV.md`)](./docs/BACKEND_DEV.md)**: Hướng dẫn vận hành API, phân quyền Admin/User và migrations TypeORM.
  2. **[Calibration Guide (`docs/CALIBRATION_GUIDE.md`)](./docs/CALIBRATION_GUIDE.md)**: Quy trình hiệu chuẩn 9 điểm và phân tích sai số.
  3. **[Eye Actions Mapping (`docs/EYE_ACTIONS_MAPPING.md`)](./docs/EYE_ACTIONS_MAPPING.md)**: Cơ chế máy trạng thái cử chỉ mắt và chống chọn nhầm.
