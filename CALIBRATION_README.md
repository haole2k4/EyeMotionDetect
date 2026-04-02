# README: Trạng thái hiện tại

Tài liệu này tóm tắt những gì đã được sửa và những giới hạn còn lại của hệ thống eye tracking. Hiện tại app đã cho phép dùng lại fallback mode để test nhanh khi chưa có calibration.

## 1. Những gì đã được fix

- `ear-detector.ts`: hạ ngưỡng nháy mắt, tăng độ nhạy cho click/drag và thêm logic tránh nhầm drag.
- `feature-extractor.ts`: chuẩn hóa `headPitch`, `headYaw`, `headRoll` về cùng scale với iris.
- `mlp-model.ts`: đổi output layer sang `linear` để có thể dự đoán sát mép màn hình.
- `GazeProvider.tsx`: sửa phần override smoother để các tham số mới thực sự có hiệu lực.
- `page.tsx`: từng chặn fallback mode khi chưa có calibration, nhưng hiện tại đã cho phép fallback lại để test nhanh.

## 2. Những thứ vẫn có thể xảy ra sau khi fix

### 2.1. Fallback mode chưa calibration vẫn có thể jitter

Đây không còn là bug logic chính, mà là giới hạn của dữ liệu đầu vào. Nếu bạn đang dùng fallback mode để test nhanh thì hiện tượng này là bình thường.

- Fallback mode dùng iris raw từ MediaPipe.
- Dữ liệu này vốn nhiễu, nhất là khi mắt nhỏ, camera mờ, hoặc ngồi xa.
- Vì vậy con trỏ vẫn có thể rung hoặc drift nếu không có calibration/model riêng.
- Fallback mode phù hợp để kiểm tra luồng chạy, không phù hợp làm chế độ dùng thật lâu dài.

### 2.2. MLP chưa train thì chưa thể dùng ổn định

- Nếu chưa calibration, MLP chưa có dữ liệu học.
- Khi đó hệ thống không có model đủ tốt để suy ra vị trí con trỏ chính xác.
- Kết quả sẽ kém ổn định hơn polynomial hoặc MLP đã train.

### 2.2.1. Drag hai mắt đã được nới nhẹ

- Hệ thống hiện cho phép hai mắt lệch nhau nhiều hơn một chút khi nhắm để kích hoạt drag.
- Thời gian giữ để vào drag cũng ngắn hơn trước.
- Điều này giúp drag dễ trúng hơn trong fallback mode và khi camera bắt mắt không thật sự đồng bộ.

### 2.3. Ánh sáng yếu hoặc webcam mờ vẫn ảnh hưởng

- MediaPipe vẫn phụ thuộc mạnh vào chất lượng ảnh đầu vào.
- Nếu ánh sáng yếu, mặt bị noise, hoặc webcam quá mờ, gaze sẽ drift nhiều hơn.
- Đây là giới hạn thực tế của pipeline thị giác máy tính, không phải chỉ do threshold.

## 3. Kết luận thực tế

Nếu muốn hệ thống dùng thật ổn định, nên ưu tiên quy trình này:

1. Cấp quyền camera.
2. Calibration ít nhất một lần.
3. Dùng polynomial hoặc MLP đã lưu.
4. Chỉ dùng fallback mode cho test nhanh hoặc khi chưa có dữ liệu calibration.

## 4. Nếu muốn hoàn thiện tiếp

- Ép người dùng calibration trước khi Start.
- Hiển thị rõ trạng thái `fallback`, `polynomial`, `mlp` trên UI.
- Thêm hướng dẫn calibration ngắn ngay trong app.
- Nếu cần, thêm cảnh báo khi ánh sáng quá yếu hoặc face tracking không ổn định.
