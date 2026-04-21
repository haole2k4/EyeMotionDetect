# Calibration Guide

Tài liệu này mô tả quy trình hiệu chuẩn (calibration) cho hệ thống lưới 3x3 (Grid Matrix) dùng để điều khiển giao diện web bằng mắt.

## Mục tiêu hiệu chuẩn

Hiệu chuẩn đóng vai trò cung cấp dữ liệu cơ sở (Ground Truth) để các mô hình phi tuyến tính (`PolynomialGazeMapper` và `GazeMLPModel`) học được sự biến dạng hình học của mắt cũng như cấu trúc khuôn mặt của người dùng hiện tại lên tọa độ màn hình. 

Hệ thống đã nâng cấp từ cơ chế 4 điểm lên **9 điểm hiệu chuẩn** để bao phủ toàn bộ giới hạn của ma trận 3x3. Điều này đảm bảo thuật toán không dự đoán sai ở các vị trí giữa cạnh và khoảng trung tâm màn hình.

## Quy trình hiệu chuẩn 9 điểm

1. Đăng nhập hệ thống (yêu cầu bật quyền truy cập camera).
2. Đảm bảo chỉ có 1 khuôn mặt nằm trong tầm nhìn của Camera.
3. Bấm **Bắt đầu Calibration**.
4. Lần lượt nhìn vào 9 điểm hiệu chuẩn chớp tắt trên màn hình. Mỗi điểm được neo bằng công thức toán học nội suy chuẩn `1/6`, `1/2`, `5/6` chiều rộng/cao màn hình, tương đương với tọa độ trung tâm của các ô sau:
   - Row 0 (Top): Left, Center, Right
   - Row 1 (Mid): Left, Center, Right
   - Row 2 (Bottom): Left, Center, Right
5. Khi nhìn vào điểm mục tiêu, hạn chế "chớp mắt" hoặc "lắc đầu". Giữ yên khoảng 1-2 giây cho đến khi hệ thống tự động lưu mẫu và trỏ sáng sang điểm tiếp theo.
6. Kết thúc vòng thu thập, hệ thống sẽ gộp dữ liệu cũ (nếu có) và bắt đầu huấn luyện Ridge Regression cũng như Mạng nơ-ron đa lớp (MLP Neural Network).

## Khi nào cần thực hiện Calibration lại

- Đổi người sử dụng.
- Đổi môi trường: Ánh sáng mạnh chiếu ngang, chênh sáng, trời tối.
- Thay đổi phần cứng: Chỉnh ghế ngồi cao/thấp hơn, thay màn hình to hơn, đổi góc ngẩng của Webcam.
- Hệ thống có vùng miền bắt đầu hoạt động không chính xác, gây tình trạng dính góc màn hình hoặc Midas Touch.

## Lưu trữ dữ liệu

Toàn bộ Weights của `PolynomialGazeMapper` (Bậc 2) và `GazeMLPModel` kèm số điểm mẫu huấn luyện đều sẽ được lưu trữ cục bộ (Local Storage).
Người dùng có thể tiến hành gộp vòng calibration mới vào vòng cũ để cải thiện độ mượt hoặc chọn **Reset Calibration Data** để dọn dẹp hệ thống quay về từ đầu.

## Sai số MAE (Mean Absolute Error)

**Sai số MAE** đo lường độ phân tán và chênh lệch trung bình (tính bằng px) giữa kết quả dự đoán của Mạng Nơ-ron (MLP) so với điểm ngắm thực tế. MAE càng nhỏ thì độ chính xác của con trỏ khi theo dõi chuyển động mắt càng cao.

Khi trạng thái MAE hiển thị là **"Chưa đo"** trên màn hình giao diện (và giá trị `lastMaePixels` là `null` trong cơ sở dữ liệu Postgres), điều này thường có nghĩa là:
- Người dùng chưa hoàn thành bất kỳ một quá trình hiệu chuẩn (Calibration) nào.
- Người dùng vừa thực hiện **Reset Calibration Data**.

### Làm sao để cập nhật sai số MAE?
1. Chuyển đển trình giao diện `/gaze` hoặc bấm nút **Bắt đầu Calibration**.
2. Nhìn theo và giữ thẳng mắt vào 9 điểm hiệu chuẩn theo quy trình vòng huấn luyện.
3. Khi quá trình thu thập hoàn tất, hệ thống tự động train mô hình (MLP Training). Hệ thống sẽ trả về giá trị **Final MAE** sau lượt Epoch cuối cùng.
4. Mức sai số này được tự động gửi qua API (`PUT /weights/stats`) và lưu vào cơ sở dữ liệu `gaze_dev` trong trường `lastMaePixels` thuộc bảng `gaze_weights`. Qua đó, giao diện quay trở lại trang `/user/calibration` sẽ cập nhật giá trị px.

### Tra cứu MAE trực tiếp qua CSDL bằng pgAdmin
Với môi trường dev cung cấp sẵn qua Docker, bạn có thể kiểm tra trực tiếp trường `lastMaePixels` xem đã lưu chưa thông qua **pgAdmin**.

- **Truy cập:** Đi tới `http://localhost:5050` (hoặc cổng cấu hình host).
- **Tài khoản pgAdmin:** Email: `admin@eyemotiondetect.dev` | Mật khẩu: `admin123456`
- **Kết nối Server:** Server "EyeMotionDetect Local" sẽ được nạp sẵn nhờ file `servers.json`. Click đúp vào server này. Username database là `gaze` và mật khẩu là `gaze_dev_pass`.
- **Thao tác Query:** Mở Query Tool trỏ vào Database `gaze_dev`. Chạy câu lệnh SQL:
  ```sql
  SELECT id, "lastMaePixels", "calibrationPoints", "updatedAt" FROM gaze_weights;
  ```
  Nếu giá trị trả ra là `null`, bạn cần vào màn hình Calibration ứng dụng để đo lại.
