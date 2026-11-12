# AGENT.md — Hướng dẫn Kỹ thuật & Quy chuẩn Phát triển cho AI Agent

Tài liệu này cung cấp ngữ cảnh kiến trúc, quy trình làm việc và các nguyên tắc kỹ thuật bắt buộc khi AI Agent tham gia phát triển, bảo trì hoặc mở rộng dự án **EyeMotionDetect**.

---

## 1. Tổng quan Dự án

**EyeMotionDetect** là nền tảng thi trắc nghiệm trực tuyến (MCQ 4 lựa chọn) điều khiển hoàn toàn bằng cử động mắt trên trình duyệt (**Edge-AI Gaze Tracking**), được thiết kế đạt chuẩn trợ năng **WCAG AAA** dành cho học sinh, sinh viên và người khuyết tật vận động chi trên.

- **Mô hình kiến trúc:** Monorepo (`pnpm` + `Turborepo`) kết hợp **Rust WebAssembly (`crates/gaze-core`)**, **Next.js 15 (`apps/web`)**, **NestJS 11 + PostgreSQL (`apps/api`)**, và **Python R&D Suite (`evaluation/`)**.
- **Luồng xử lý thời gian thực:** Tách biệt hoàn toàn luồng suy luận thị giác máy tính trong Web Worker (**30 FPS** với MediaPipe Face Landmarker + Rust WASM) và luồng hiển thị giao diện (**144Hz Zero-Jank** qua `SharedArrayBuffer` + bộ nội suy lò xo tới hạn).

---

## 2. Cấu trúc Thư mục & Phân hệ Cốt lõi

```text
EyeMotionDetect/
├── crates/
│   └── gaze-core/                 # Lõi toán học thuần Rust biên dịch ra WebAssembly
│       ├── src/features.rs        # Hệ tọa độ khóe mắt giải phẫu bất biến góc nghiêng + Vector 18D
│       ├── src/calibration.rs     # Nghiệm đóng Huber IRLS Ridge SVD (<0.3ms) + Implicit Drift Corrector
│       ├── src/filters.rs         # 1€ Filter 2D + 144Hz Critically-Damped Spring + Magnetic Target Snap
│       ├── src/gestures.rs        # Pitch-Compensated EAR + Dwell + Saccadic Strokes + Smooth Pursuit Orbit
│       └── src/lib.rs             # C-ABI WASM exports & SharedGazeBuffer (Float32Array 12 phần tử)
├── apps/
│   ├── web/                       # Frontend Next.js 15 (React 19, Tailwind CSS v4)
│   │   ├── public/wasm/           # Chứa binary đã biên dịch: gaze_core.wasm
│   │   ├── lib/wasm-pkg/          # Wrapper nạp WASM & fallback toán học đồng构
│   │   ├── lib/gaze-bridge/       # Cầu nối giao tiếp engine & quản lý SharedGazeBuffer
│   │   ├── workers/gaze.worker.ts # Web Worker chạy MediaPipe + Rust WASM ở 30 FPS
│   │   ├── components/gaze/       # GazeProvider (vòng lặp 144Hz), CalibrationPanel, DebugOverlay
│   │   ├── components/mcq/        # MCQBoard chuẩn WCAG AAA, Smooth Pursuit Orbit, Saccadic HUD
│   │   └── app/                   # Các trang ứng dụng (/gaze, /user/exams/..., /admin/...)
│   └── api/                       # Backend NestJS 11 + TypeORM + PostgreSQL 17
│       └── src/                   # Modules: auth, users (AccessibilityProfile), weights, questions, exams (GazeHeatmap)
├── evaluation/                    # Công cụ kiểm định toán học & R&D (Python & TypeScript)
│   ├── benchmark_suite.py         # Đánh giá MAE / R² / Latency của thuật toán hiệu chuẩn
│   ├── pretrain_onnx.py           # Huấn luyện trước trọng số tiên nghiệm (prior weights)
│   ├── local_ws_daemon.py         # Daemon WebSocket tùy chọn cho webcam V4L2 tốc độ cao
│   └── artifacts/                 # Báo cáo kết quả benchmark JSON & trọng số pre-trained ONNX/JSON
└── docs/                          # Tài liệu hướng dẫn vận hành chi tiết
```

---

## 3. Các Lệnh Làm việc Thường dùng (Commands)

### 3.1. Khởi chạy Môi trường Phát triển
```bash
# 1. Bật PostgreSQL 17 & pgAdmin4 qua Docker
pnpm run docker:up
# (Hoặc: docker compose -f docker-compose.dev.yml up -d)

# 2. Chạy đồng thời Frontend (port 3000) và Backend API (port 3001)
pnpm run dev
```

### 3.2. Kiểm thử & Biên dịch Rust WASM Core (`crates/gaze-core`)
```bash
# Chạy toàn bộ unit tests toán học trong Rust
cargo test

# Biên dịch sang WebAssembly tối ưu hóa kích thước & tốc độ và copy vào web public
pnpm run build:wasm
# (Hoặc: cargo build --target wasm32-unknown-unknown --release && cp target/wasm32-unknown-unknown/release/gaze_core.wasm apps/web/public/wasm/gaze_core.wasm)
```

### 3.3. Kiểm thử & Build Monorepo (`apps/web` & `apps/api`)
```bash
# Chạy toàn bộ unit tests (NestJS API + Rust cargo test)
pnpm run test
# (Hoặc chạy riêng API: pnpm --filter api test)

# Kiểm tra lint và build toàn bộ dự án
pnpm run lint
pnpm run build

# Chạy bộ kiểm định thuật toán Python R&D
pnpm run test:eval
# (Hoặc: python3 evaluation/benchmark_suite.py)
```

---

## 4. Giao thức Bộ nhớ `SharedGazeBuffer` (`Float32Array(12)`)

Web Worker (`gaze.worker.ts`) và Main Thread (`GazeProvider.tsx`) trao đổi dữ liệu qua bộ đệm 12 số thực `Float32Array` (ưu tiên `SharedArrayBuffer` khi `crossOriginIsolated === true`, tự động fallback về mảng `Float32Array` zero-alloc):

| Chỉ số | Tên trường | Ý nghĩa |
| :---: | :--- | :--- |
| `[0]`, `[1]` | `rawX`, `rawY` | Tọa độ điểm nhìn thô từ Huber Ridge SVD (px) |
| `[2]`, `[3]` | `filteredX`, `filteredY` | Tọa độ sau khi qua bộ lọc `OneEuroFilter2D` (px) |
| `[4]`, `[5]` | `snappedX`, `snappedY` | Tọa độ sau khi áp dụng lực hút từ tính `MagneticTargetSnap` (px) |
| `[6]` | `activeTargetId` | `-1`: None, `0`: A, `1`: B, `2`: C, `3`: D, `4`: PREV, `5`: NEXT, `6`: SUBMIT |
| `[7]` | `gestureEventCode` | `0`: None, `1`: BlinkSelect, `2`: DwellSelect, `3`: SaccadePrev, `4`: SaccadeNext, `5`: PursuitConfirm |
| `[8]`, `[9]` | `earLeft`, `earRight` | Chỉ số mở mắt trái và phải (Eye Aspect Ratio) |
| `[10]` | `faceCount` | Số khuôn mặt phát hiện được trong khung hình |
| `[11]` | `lightingAndPoseScore` | Điểm chất lượng ánh sáng và tư thế đầu `[0.0 .. 1.0]` |

---

## 5. Quy tắc Bắt buộc dành cho AI Agent (Guardrails)

1. **TUYỆT ĐỐI KHÔNG dùng `window.confirm`, `window.alert`, hoặc `window.prompt`:**
   - Người dùng liệt tay không thể tương tác với hộp thoại hệ điều hành của trình duyệt.
   - Mọi hành động nhạy cảm (như **Nộp bài**, **Làm lại hiệu chuẩn**, **Thoát phòng thi**) bắt buộc phải dùng **Gaze-Aware Modal** trong React hoặc nút quỹ đạo **Smooth Pursuit Orbit**.
2. **Bảo toàn hiệu năng 144Hz Zero-Jank trên Main Thread:**
   - Không gọi `useState` / `setState` của React ở tần số khung hình (`30–144Hz`) cho tọa độ ánh mắt `(x, y)`.
   - Vị trí con trỏ **Soft Spotlight** phải được cập nhật trực tiếp qua DOM `ref` bằng `transform: translate3d(x, y, 0)` bên trong vòng lặp `requestAnimationFrame` kết hợp `SpringInterpolator2D`.
3. **Đồng bộ giữa Rust WASM và TypeScript Bridge:**
   - Khi thay đổi cấu trúc vector đặc trưng 18 chiều hoặc layout 12 phần tử của `SharedGazeBuffer` trong `crates/gaze-core`, phải cập nhật đồng bộ tại `apps/web/lib/wasm-pkg/index.ts`, `apps/web/lib/gaze-bridge/engine.ts`, `apps/web/workers/gaze.worker.ts` và `apps/web/components/gaze/GazeProvider.tsx`, đồng thời biên dịch lại file `apps/web/public/wasm/gaze_core.wasm`.
4. **Không đưa `@tensorflow/tfjs` quay lại luồng suy luận:**
   - Bài toán ánh xạ điểm nhìn cá nhân hóa sử dụng nghiệm đóng **Huber IRLS Ridge SVD** trên không gian đặc trưng giải phẫu 18 chiều (thời gian huấn luyện `< 0.3ms`, không gây dừng bộ thu gom rác GC). Trọng số 18 chiều được lưu tương thích ngược trong cột `polyCoeffsX` và `polyCoeffsY` (`jsonb`) của bảng `gaze_weights`.
5. **Tuân thủ chuẩn trợ năng WCAG AAA:**
   - Giữ khoảng cách an toàn giữa các thẻ đáp án $\ge 48\text{px}$, cỡ chữ câu hỏi $\ge 24\text{px}$, hỗ trợ đọc đề tự động qua Web Speech API (`vi-VN`) và tự động tạm dừng đồng hồ thi khi mất dấu khuôn mặt (`faceCount === 0`).
