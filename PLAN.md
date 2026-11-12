# KẾ HOẠCH THỰC THI & TÁI CẤU TRÚC TOÀN DIỆN DỰ ÁN `EyeMotionDetect`
**(Mô hình Điều phối: Gemini 4 Argon [Lead Advisor & Architect] + Gemini 3.8 Flash [Coding Sub-Agents])**

- **Repository:** `haole2k4/EyeMotionDetect`
- **Môi trường phát triển chuẩn:** Acer Aspire 7 R8GA (AMD Ryzen 5 5625U / NVIDIA RTX 3050 4GB / **16GB RAM** / Màn hình 144Hz / **Fedora Linux 44**).
- **Tài liệu tham chiếu gốc:** `~/Downloads/refactor_eye_motion_detect.md`

---

## 1. Đối chiếu Thực trạng Codebase & Đề xuất Cải tiến từ Advisor (Gap Analysis)

Qua kiểm toán toàn bộ mã nguồn hiện tại trong `apps/web`, `apps/api`, và `evaluation`, dưới đây là bảng đối chiếu chi tiết giữa bản kế hoạch gốc và thực tế mã nguồn cùng các cải tiến kỹ thuật cần thiết:

| Hạng mục đối chiếu | Giả định trong bản kế hoạch gốc | Thực trạng chính xác trong Codebase hiện tại | Đề xuất Hiệu chỉnh & Cải tiến từ Advisor (Argon) |
| :--- | :--- | :--- | :--- |
| **1. Chuẩn hóa mống mắt (`feature-extractor.ts`)** | Cho rằng code đang chuẩn hóa theo khung bao mí mắt. | `apps/web/lib/gaze/feature-extractor.ts` (dòng 65–90) đã lấy điểm `133`, `33`, `362`, `263`, **nhưng** lại chiếu thẳng lên trục `X/Y` của ảnh 2D mà **không xoay theo góc nghiêng của trục nối hai khóe mắt** ($\theta_{\text{eye}}$) và nhân hệ số khuếch đại cứng `diff * 3.5` (dòng 134). Khi nghiêng đầu nhẹ ($5^\circ$), độ lệch trục `X` bị trộn sang `Y` làm con trỏ nhảy vọt. Ngoài ra chỉ lấy 1 điểm tâm mống mắt (`468`, `473`) thay vì trung bình 5 điểm mống mắt, và thiếu hoàn toàn khoảng cách liên mắt `IOD` ($Z$-depth) cùng tọa độ tâm mặt `(faceX, faceY)` để bù thị sai góc nhìn. | Trong `crates/gaze-core/src/features.rs`, xây dựng **Hệ tọa độ Nội tại Khóe mắt 2D/3D (Orthonormal Eye-Corner Basis $(\vec{u}, \vec{v})$)**: chiếu tâm 5 điểm mống mắt (`468..472`, `473..477`) lên vector đơn vị nối khóe mắt trong $\to$ ngoài ($\vec{u}$) và vector vuông góc ($\vec{v}$). Bất biến 100% với góc nghiêng đầu `Roll` trước khi đưa vào vector 18 chiều. |
| **2. Nghẽn cổ chai 144Hz & Xung đột Click (`GazeProvider.tsx` & `mouse-controller.ts`)** | Worker gửi 478 điểm mốc về Main Thread và chạy MLP gây GC pause. | Trong `apps/web/components/gaze/GazeProvider.tsx` (dòng 271–306), mỗi vòng lặp `requestAnimationFrame` đang gọi **2 lệnh RPC tuần tự (`await detectFrame` rồi `await inferGaze`)** qua `comlink`, khiến vòng lặp render bị khóa cứng ở tốc độ camera (~25–30 FPS) thay vì 144Hz. Nghiêm trọng hơn: đang có **lỗi Double-Dwell Click** do cả `WebCursorController.moveTo()` (dwell `800ms`) lẫn `GazeProvider.tsx` (dwell `3000ms`) cùng bắn sự kiện `click` độc lập! | 1. **Tách rời 2 vòng lặp:** Vòng lặp Camera/Worker chạy độc lập ở 30 FPS; vòng lặp UI `requestAnimationFrame` chạy tự do ở **144Hz** kèm bộ nội suy lò xo (**Critically-Damped 144Hz Spring Interpolator**) đọc từ bộ đệm.<br>2. **Hợp nhất bộ điều khiển Click:** Xóa bỏ logic dwell trùng lặp trong `mouse-controller.ts`, quy về một máy trạng thái cử chỉ duy nhất trong `crates/gaze-core`. |
| **3. Tương thích `SharedArrayBuffer` với CDN MediaPipe** | Dùng `SharedArrayBuffer` trực tiếp giữa Worker và Main Thread. | `SharedArrayBuffer` yêu cầu header `COOP: same-origin` và `COEP: require-corp` (hoặc `credentialless`). Tuy nhiên `apps/web/lib/gaze/mediapipe.ts` (dòng 40–46) đang tải WASM và `face_landmarker.task` từ `cdn.jsdelivr.net` và `storage.googleapis.com` — dễ bị chặn bởi `COEP: require-corp`. | 1. Cấu hình header `Cross-Origin-Opener-Policy: same-origin` và `Cross-Origin-Embedder-Policy: credentialless` trong `apps/web/next.config.ts`, đồng thời hỗ trợ tải model MediaPipe local (`public/models/`).<br>2. Thiết kế `GazeStateBuffer` hỗ trợ **Dual-Transport**: tự động dùng `SharedArrayBuffer` khi `crossOriginIsolated === true` và fallback mượt về mảng tĩnh `Float32Array` zero-alloc khi không bật COOP/COEP. |
| **4. Hộp thoại `window.confirm` chặn người khuyết tật** | Chưa được nhắc tới trong chẩn đoán gốc. | `CalibrationPanel.tsx` (dòng 222, 246) và `ExamSessionFocusMode` (`session/[sessionId]/page.tsx` dòng 139) dùng `window.confirm(...)` mặc định của trình duyệt. Người liệt tay **không thể bấm OK/Cancel trên popup hệ điều hành bằng mắt**! Ngoài ra `dwellTimeMs: 2500` đang bị gán cứng (dòng 187). | Thay thế toàn bộ `window.confirm` bằng **Gaze-Aware Modal / Smooth Pursuit Orbit Button** ngay trên giao diện React; đo chính xác `dwellTimeMs` thực tế thí sinh nhìn vào câu hỏi/đáp án. |
| **5. Tương thích ngược Database (`gaze_weights`)** | Mở rộng thêm trường cho `users`, `exams`, `weights`. | Bảng `gaze_weights` hiện có `polyCoeffsX` và `polyCoeffsY` kiểu `jsonb`. | Tái sử dụng trực tiếp `polyCoeffsX` và `polyCoeffsY` để lưu trọng số 18 chiều của bộ giải **Rust Huber Ridge SVD**, giúp giữ tương thích ngược 100% API `/weights/poly` trong khi gỡ bỏ hoàn toàn `@tensorflow/tfjs`. |
| **6. Công cụ hệ thống trên máy Fedora 44 hiện tại** | Cần `rust`, `cargo`, `wasm-pack`, `v4l2-ctl`. | Đã kiểm tra: Máy đã có sẵn `rustc 1.99.1`, `cargo`, `pnpm 10.18.2`, `node`, `python3`, `nvidia-smi`. Chưa có `wasm-pack` và `v4l2-ctl`. | Cài đặt `wasm-pack` qua `cargo install wasm-pack` (hoặc `sudo dnf install wasm-pack v4l-utils`) và thêm target `wasm32-unknown-unknown`. |

---

## 2. Phân công Vai trò & Quy trình Điều phối Đa Tác tử (Argon + Flash)

- **Gemini 4 Argon (Lead Advisor & Coordinator):**
  - Thiết kế đặc tả toán học, cấu trúc dữ liệu Rust/TypeScript, giao thức bộ nhớ `SharedArrayBuffer` và kiểm soát tiến độ qua từng giai đoạn.
  - Thực hiện Code Review nghiêm ngặt (kiểm tra an toàn bộ nhớ, hiệu năng 144Hz, chuẩn WCAG AAA) sau mỗi lần sub-agent hoàn thành tác vụ.
- **Gemini 3.8 Flash (Coding Sub-Agents - gọi qua `invoke_subagent` với `Model: "flash"`):**
  - **Packet 1 (`Flash-Rust-Core`):** Khởi tạo và lập trình `crates/gaze-core` (`features.rs`, `calibration.rs`, `filters.rs`, `gestures.rs`, `lib.rs`) kèm bộ unit test toán học đầy đủ.
  - **Packet 2 (`Flash-Web-Worker`):** Biên dịch WASM, nâng cấp `gaze.worker.ts`, `GazeProvider.tsx`, `mouse-controller.ts`, `next.config.ts` và gỡ bỏ `@tensorflow/tfjs`.
  - **Packet 3 (`Flash-Frontend-UX`):** Nâng cấp `CalibrationPanel.tsx`, `MCQBoard.tsx`, `session/[sessionId]/page.tsx` (Magnetic Cursor, Smooth Pursuit Orbit, Saccadic Strokes, Head Pose & Lighting HUD, TTS `vi-VN`, Pause-on-Face-Loss).
  - **Packet 4 (`Flash-Backend-R&D`):** Mở rộng Entity/DTO/Controller trong `apps/api` (`AccessibilityProfile`, `GazeHeatmap`), cập nhật trang Admin (`/admin/users`, `/admin/gaze-data`) và xây dựng bộ công cụ Python R&D trong `evaluation/`.

---

## 3. Thiết kế Kỹ thuật Chi tiết Cho Từng Phân hệ

### 3.1. Phân hệ 1: Rust WASM Core Engine (`crates/gaze-core`)

```text
crates/gaze-core/
├── Cargo.toml
└── src/
    ├── lib.rs          # WASM bindings (GazeEngineWasm) & SharedGazeBuffer layout
    ├── features.rs     # Roll-invariant anatomical eye-corner basis + 18D feature vector
    ├── calibration.rs  # Closed-form Huber IRLS Ridge SVD (< 2ms) + Implicit Drift Corrector
    ├── filters.rs      # 1€ Filter 2D + Critically-Damped Spring + Magnetic Target Snap
    └── gestures.rs     # Pitch-Compensated EAR + Saccadic Edge Stroke + Smooth Pursuit Orbit
```

1. **Hệ quy chiếu Khóe mắt Giải phẫu Bất biến Góc nghiêng (`src/features.rs`):**
   - Với mỗi mắt, gọi $P_{\text{inner}}$ (`133` trái, `362` phải) và $P_{\text{outer}}$ (`33` trái, `263` phải).
   - Đặt vector đơn vị trục ngang mắt:
     $$\vec{u} = \frac{P_{\text{outer}} - P_{\text{inner}}}{\|P_{\text{outer}} - P_{\text{inner}}\|}, \quad \vec{v} = (-u_y, u_x)$$
   - Tâm mống mắt $P_{\text{iris}}$ được tính bằng trung bình cộng 5 điểm mốc mống mắt (`468..=472` cho mắt trái, `473..=477` cho mắt phải).
   - Tọa độ chuẩn hóa nội tại:
     $$x_{\text{iris}} = \frac{(P_{\text{iris}} - P_{\text{inner}}) \cdot \vec{u}}{\|P_{\text{outer}} - P_{\text{inner}}\|}, \quad y_{\text{iris}} = \frac{(P_{\text{iris}} - P_{\text{center}}) \cdot \vec{v}}{\|P_{\text{outer}} - P_{\text{inner}}\|}$$
   - Kết hợp với `pitch, yaw, roll` từ ma trận chuyển đổi khuôn mặt 4x4, khoảng cách liên mắt $\text{IOD} = \|P_{362} - P_{133}\|$, tọa độ tâm mặt $(face_x, face_y)$ và các số hạng bậc hai tạo thành **Vector 18 chiều (`[f64; 18]`)**.

2. **Huấn luyện Tức thì bằng Nghiệm đóng Huber Ridge SVD (`src/calibration.rs`):**
   - Giải bài toán tối ưu bền vững bằng IRLS (5 vòng lặp) kết hợp phân rã giá trị kỳ dị SVD:
     $$w^{(k+1)} = \left(X^T W^{(k)} X + \lambda I\right)^{-1} X^T W^{(k)} y$$
   - Trong đó trọng số Huber $W_{ii}^{(k)} = \min\left(1, \frac{\delta}{|r_i^{(k)}|}\right)$ tự động loại bỏ các điểm ngoại lai (chớp mắt, nhìn lệch) trong quá trình hiệu chuẩn 9 điểm.
   - **Implicit Drift Correction:** Lưu cửa sổ trượt 24 điểm xác nhận đáp án gần nhất để cập nhật vector bù trôi $(\Delta x, \Delta y)$ theo thời gian thực khi thí sinh đổi tư thế ngồi.

3. **Lực hút Từ tính & Bộ lọc 1€ (`src/filters.rs`):**
   - `OneEuroFilter2D`: Lọc nhiễu tần số cao khi nhìn cố định nhưng phản hồi tức thì khi đảo mắt nhanh.
   - `MagneticTargetSnap`: Khi khoảng cách từ điểm nhìn $(x, y)$ tới tâm thẻ đáp án $T_k = (c_{kx}, c_{ky})$ nhỏ hơn bán kính hút $R_{\text{gravity}}$, áp dụng lực hút mềm:
     $$P_{\text{snapped}} = \alpha(d) \cdot T_k + (1 - \alpha(d)) \cdot P_{\text{filtered}}$$
     giúp khóa tâm thẻ ổn định, triệt tiêu hoàn toàn rung động $\pm 50\text{px}$ của webcam 720p.

4. **Hệ thống Cử chỉ Mắt Đa phương thức (`src/gestures.rs`):**
   - **Pitch-Compensated EAR:**
     $$\text{Threshold}(y_{\text{norm}}) = \text{EAR}_{\text{baseline}} \times (0.60 - 0.12 \times y_{\text{norm}})$$
     Ngăn chặn hoàn toàn lỗi nhận nhầm chớp mắt khi thí sinh nhìn xuống đáp án C, D ở đáy màn hình.
   - **Saccadic Edge Strokes:** Liếc nhanh ra vùng biên trái (`x < 0.08W`) hoặc biên phải (`x > 0.92W`) rồi quay lại vùng trung tâm trong `< 450ms` để chuyển câu (`PREV` / `NEXT`).
   - **Smooth Pursuit Orbit:** Nút nhạy cảm ("Nộp bài") có chấm sáng quay tròn với tần số góc $\omega = \frac{2\pi}{1.2\text{s}}$. Tính độ tương đồng hướng vận tốc giữa mắt và chấm sáng trong `1.2s`; chỉ kích hoạt khi hệ số tương quan đạt ngưỡng $> 0.78$, đảm bảo tỷ lệ bấm nhầm bằng **0%**.

---

### 3.2. Phân hệ 2: Kiến trúc Đa luồng Zero-Jank 144Hz (`apps/web`)

1. **Giao thức Bộ nhớ Dùng chung (`SharedGazeBuffer`):**
   - Mảng `Float32Array(12)` trên `SharedArrayBuffer` (kèm fallback `Float32Array` cho môi trường không bật COOP/COEP):
     - `[0]`: `rawX`
     - `[1]`: `rawY`
     - `[2]`: `filteredX`
     - `[3]`: `filteredY`
     - `[4]`: `snappedX`
     - `[5]`: `snappedY`
     - `[6]`: `activeTargetId` (`-1`: None, `0`: A, `1`: B, `2`: C, `3`: D, `4`: PREV, `5`: NEXT, `6`: SUBMIT)
     - `[7]`: `gestureEventCode` (`0`: None, `1`: BlinkSelect, `2`: DwellSelect, `3`: SaccadePrev, `4`: SaccadeNext, `5`: PursuitConfirm)
     - `[8]`: `earLeft`
     - `[9]`: `earRight`
     - `[10]`: `faceCount`
     - `[11]`: `lightingAndPoseScore`
2. **Tách biệt Vòng lặp 30 FPS (Worker) và 144 FPS (Main Thread):**
   - `gaze.worker.ts`: Chạy `FaceLandmarker` + `crates/gaze-core` WASM trong 1 lệnh duy nhất, ghi thẳng vào `SharedGazeBuffer`.
   - `GazeProvider.tsx`: Vòng lặp `requestAnimationFrame` chạy ở tốc độ màn hình **144Hz**, nội suy vị trí con trỏ **Soft Spotlight** bằng `transform: translate3d(x, y, 0)` trực tiếp trên DOM ref, đạt **0 lần React re-render** khi di chuyển mắt.

---

### 3.3. Phân hệ 3: Mở rộng Backend NestJS 11 (`apps/api`) & Giao diện Trợ năng

1. **Mở rộng Database Schema (`apps/api`):**
   - `apps/api/src/users/user.entity.ts`: Thêm cột `accessibilityProfile` (`jsonb`, nullable) lưu cấu hình mắt chủ đạo (`both` | `left` | `right`), phương thức chọn (`blink` | `dwell`), `dwellTimeMs`, `blinkDurationMs`, `ttsEnabled`.
   - `apps/api/src/exams/entities/exam-session.entity.ts`: Thêm cột `gazeHeatmap` (`jsonb`, nullable) lưu tọa độ ánh nhìn rút gọn theo từng câu hỏi.
   - Tạo migration TypeORM mới trong `apps/api/src/migrations/`.
2. **Phòng thi Trợ năng Chuẩn WCAG AAA (`apps/web/components/mcq/MCQBoard.tsx` & `session/[sessionId]/page.tsx`):**
   - Bố cục câu hỏi ở trung tâm trên (cỡ chữ $\ge 24\text{px}$, tương phản chuẩn WCAG AAA), 4 thẻ đáp án lớn ở 4 góc cách nhau $\ge 48\text{px}$.
   - **Head Pose & Lighting Box:** Cảnh báo khi thiếu sáng hoặc ngồi quá xa; **tự động tạm dừng đồng hồ đếm ngược** khi mất dấu khuôn mặt.
   - **Text-to-Speech (TTS):** Tích hợp `Web Speech API` (`vi-VN`) tự động đọc câu hỏi và đáp án khi chuyển câu.
   - **Trang Quản trị (`/admin/users` & `/admin/gaze-data`):** Quản lý `AccessibilityProfile` cho từng học sinh và hiển thị bản đồ nhiệt `Gaze Heatmap`.

---

## 4. Lộ trình Thực thi 4 Giai đoạn & Chỉ số Nghiệm thu (KPIs)

| Giai đoạn | Tác tử thực thi | Hạng mục công việc | Chỉ số nghiệm thu (KPIs) |
| :--- | :--- | :--- | :--- |
| **Giai đoạn 1**<br>*(Rust WASM Core & Zero-Jank 144Hz)* | **Argon** (Thiết kế & Review)<br>**Flash #1 & #2** (Code) | 1. Cài đặt `wasm-pack`, khởi tạo `crates/gaze-core`.<br>2. Chuyển toàn bộ toán học (`features`, `calibration`, `filters`, `gestures`) sang Rust + unit tests.<br>3. Nâng cấp `gaze.worker.ts` + `SharedGazeBuffer` + `GazeProvider.tsx` 144Hz, gỡ bỏ `@tensorflow/tfjs` và sửa lỗi double-click trong `mouse-controller.ts`. | - `cargo test` pass 100%.<br>- Thời gian tính Calibration **< 2ms**.<br>- Giao diện đạt **144 FPS** mượt tuyệt đối, không còn GC pause. |
| **Giai đoạn 2**<br>*(Thuật toán Webcam 720p & R&D RTX 3050)* | **Argon** (Kiểm định toán học)<br>**Flash #1 & #4** (Code) | 1. Tinh chỉnh chuẩn hóa khóe mắt giải phẫu bất biến góc nghiêng + IOD 18 chiều.<br>2. Hoàn thiện **Huber Ridge SVD** và **Implicit Drift Correction**.<br>3. Xây dựng `evaluation/benchmark_suite.py`, `pretrain_onnx.py` và `local_ws_daemon.py` trên RTX 3050. | - Điểm $R^2 > 0.88$, sai số MAE thô **< 65px** trên webcam 720p.<br>- Không bị trôi tâm khi nghiêng đầu nhẹ $\pm 15^\circ$. |
| **Giai đoạn 3**<br>*(Cử chỉ Đa phương thức & Con trỏ Từ tính)* | **Argon** (Review UX/Motion)<br>**Flash #3** (Code) | 1. Tích hợp **Magnetic Snap-to-Target** và con trỏ **Soft Spotlight**.<br>2. Kích hoạt **Pitch-Compensated EAR**, **Saccadic Edge Strokes** (chuyển câu) và **Smooth Pursuit Orbit** (nút Nộp bài).<br>3. Xóa bỏ hoàn toàn các hộp thoại `window.confirm` chặn người khuyết tật. | - Thời gian chọn đáp án giảm còn **0.6s – 0.8s**.<br>- Độ chính xác chọn nút đạt **~100%**, tỷ lệ bấm nhầm nút Nộp bài **0%**. |
| **Giai đoạn 4**<br>*(Mở rộng NestJS API & Hoàn thiện WCAG AAA)* | **Argon** (Nghiệm thu tổng thể)<br>**Flash #3 & #4** (Code) | 1. Tạo migration và mở rộng NestJS API (`AccessibilityProfile` & `GazeHeatmap`).<br>2. Hoàn thiện phòng thi WCAG AAA, TTS đọc đề tự động và tạm dừng giờ khi mất mặt.<br>3. Nâng cấp trang Admin cấu hình hồ sơ khuyết tật và xem biểu đồ nhiệt ánh mắt. | - `pnpm build` và `pnpm --filter api test` pass 100%.<br>- Đạt chuẩn trợ năng WCAG AAA, đồng bộ đầy đủ với PostgreSQL. |
