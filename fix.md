# Yêu cầu sửa lỗi hệ thống Eye-tracking (Nhận diện nháy mắt, Drag và Jitter con trỏ)

Hệ thống hiện tại đang gặp các vấn đề:
1. Con trỏ bị rung lắc nhẹ khi để yên.
2. Không nhận diện được thao tác nháy mắt trái/phải do thời gian nháy mắt thực tế nhanh hơn cấu hình.
3. Nhắm 1 mắt bị nhận nhầm thành Drag (nhắm 2 mắt).
4. Mô hình AI MLP không dự đoán được hướng nhìn do dữ liệu góc xoay đầu (pitch, yaw, roll) chưa được chuẩn hóa cùng scale với Iris.

Hãy thực hiện các chỉnh sửa sau vào các file tương ứng:

### 1. File: `apps/web/lib/gaze/ear-detector.ts`
Cập nhật lại các hằng số để khớp với thông số sinh học thực tế của mắt:
- Sửa `CLICK_MIN` thành `80` (giảm từ 200 để bắt được nháy mắt nhanh).
- Sửa `DRAG_MIN` thành `600` (tăng từ 500 để tránh trùng lặp với nháy mắt thường).
- Sửa `RATIO` (bên trong `baselineEAR` logic) thành `0.6` (giảm từ 0.75 để yêu cầu người dùng nhắm chặt mắt hơn, tránh nhận nhầm).

### 2. File: `apps/web/lib/gaze/smoother.ts`
Chỉnh sửa tham số của bộ lọc trung bình động (EMA) để khử rung (Jitter):
- Trong constructor, sửa `alpha` thành `0.08` (giảm từ 0.25).
- Trong constructor, sửa `deadZone` thành `12` (tăng từ 8).

### 3. File: `apps/web/lib/gaze/feature-extractor.ts`
Chuẩn hóa lại dữ liệu đầu vào cho AI để tránh việc giá trị góc đầu (tính theo độ) đè bẹp giá trị tròng mắt (tính theo tỷ lệ 0-1):
- Trong object được `return` ở cuối hàm `extractFeatures`, hãy chia các giá trị `pitch`, `yaw`, `roll` cho `90.0`.
- Cụ thể, sửa thành: 
  `headPitch: pitch / 90.0`
  `headYaw: yaw / 90.0`
  `headRoll: roll / 90.0`

Vui lòng áp dụng các thay đổi này và giữ nguyên các logic xử lý khác.


# Yêu cầu sửa lỗi trỏ chuột bị kẹt ở trung tâm màn hình (Fix AI Model Output & Gaze Smoother)

Trỏ chuột đang không thể di chuyển ra các mép màn hình. Cần sửa đổi activation function của AI và nới lỏng bộ lọc để phù hợp với người dùng có mắt nhỏ/webcam mờ. Hãy thực hiện 2 chỉnh sửa sau:

### 4. File: `apps/web/lib/gaze/mlp-model.ts`
Chuyển đổi bài toán thành Linear Regression thay vì dùng Sigmoid để AI có thể dự đoán chính xác các tọa độ sát mép biên (0 và 1):
- Tìm cấu hình layer cuối cùng trong hàm `build()`: `tf.layers.dense({ units: 2, activation: 'sigmoid', name: 'output' })`.
- Đổi `activation: 'sigmoid'` thành `activation: 'linear'`.

### 5. File: `apps/web/lib/gaze/smoother.ts`
Giảm ngưỡng "vùng chết" để con trỏ nhận diện được các cử động mắt biên độ nhỏ:
- Trong `constructor`, sửa tham số `deadZone` xuống `5` (thay vì 12).