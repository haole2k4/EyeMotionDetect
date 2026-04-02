# Hướng Dẫn Hiệu Chỉnh Hệ Thống Eye-Tracking (Calibration Guide)

Để khắc phục tình trạng con trỏ chuột bị rung lắc, trượt hoặc kẹt ở góc, bạn bắt buộc phải thực hiện bước Hiệu chỉnh (Calibration) trước khi sử dụng chính thức. Hệ thống cần "học" cách đôi mắt của bạn di chuyển trên không gian màn hình thực tế.

## 1. Thiết Lập Môi Trường & Phần Cứng
Việc nhận diện ánh mắt đòi hỏi chất lượng hình ảnh đầu vào rất khắt khe.
* **Ánh sáng:** Đảm bảo khuôn mặt được chiếu sáng rõ ràng, đều hai bên. Tuyệt đối không ngồi ngược sáng (có cửa sổ hoặc đèn mạnh hắt từ phía sau).
* **Góc Webcam & Màn hình:** Khi sử dụng kết hợp laptop Acer Aspire cùng với màn hình ngoài 27" (1920x1080) có tần số quét cao, khoảng cách vật lý và góc nhìn sẽ thay đổi lớn khi bạn nhìn từ mép này sang mép kia. 
    * Hãy đặt webcam thẳng diện với khuôn mặt, tốt nhất là gắn ngay trên cạnh viền của màn hình 27" đang được dùng để hiển thị nội dung chính.
    * Khoảng cách ngồi lý tưởng: 50 - 70 cm so với màn hình.

## 2. Thông Số Hệ Thống & Ngưỡng Giới Hạn (Dành cho Developer/Tester)
Hệ thống hiện tại đã được cấu hình với các thông số sinh trắc học sau:
* **Lấy mẫu (Sampling):** * `SAMPLES_PER_POINT = 25`: Hệ thống sẽ chụp 25 khung hình tại mỗi điểm hiệu chỉnh để tính ra giá trị trung vị (median) chính xác nhất.
    * `STABLE_WAIT_MS = 1200ms`: Khi một điểm mới xuất hiện, hệ thống sẽ cho bạn 1.2 giây để chuyển mắt đến mục tiêu và giữ cho mắt ổn định trước khi bắt đầu ghi nhận dữ liệu.
* **Bộ lọc khử nhiễu (Lúc lấy mẫu):** Bất kỳ khung hình nào ghi nhận bạn đang chớp mắt hoặc nhắm mắt (Tỷ lệ EAR < 0.18) sẽ bị loại bỏ để không làm sai lệch dữ liệu hướng nhìn.
* **Khử rung (Jitter Deadzone):** Mắt có những vi chuyển động tự nhiên. Con trỏ sẽ bỏ qua các chuyển động nhỏ hơn `5 pixels` trên màn hình để giữ độ tĩnh.

## 3. Quy Trình Hiệu Chỉnh Tiêu Chuẩn
Bạn sẽ cần nhìn vào một loạt các điểm (thường là 9 điểm) xuất hiện tuần tự trên màn hình (4 góc, 4 cạnh giữa và 1 điểm trung tâm).

**Các bước thực hiện:**
1. Nhấn nút **Bắt đầu Calibration**.
2. Khi điểm tròn xuất hiện, **chỉ di chuyển ánh mắt** để nhìn vào điểm đó, cố gắng giữ đầu cố định.
3. Nhìn chằm chằm vào điểm tròn trong ít nhất 1.5 giây (để vượt qua `STABLE_WAIT_MS` và hệ thống thu thập đủ 25 frames).
4. Không nháy mắt trong lúc điểm tròn đang chuyển màu/thu thập dữ liệu.
5. Lặp lại cho đến khi hoàn thành toàn bộ các điểm.

*Lưu ý: Bạn nên thực hiện quy trình này ít nhất 1 lần cho mỗi phiên làm việc, hoặc mỗi khi bạn thay đổi tư thế ngồi/góc màn hình.*

## 4. Hướng Dẫn Thao Tác Sau Hiệu Chỉnh
Sau khi mô hình MLP đã được train bằng dữ liệu của bạn, thao tác sẽ được kích hoạt với các ngưỡng sau:
* **Click chuột (Nháy mắt):** Nháy mắt nhanh (dưới 80ms) và dứt khoát.
* **Kéo thả - Drag (Nhắm hai mắt):** Nhắm chặt cả hai mắt trong thời gian khoảng 0.6 giây (600ms) để vào chế độ drag. Thực hiện thao tác tương tự để thả.
* **Tỷ lệ nhắm (EAR Ratio = 0.6):** Bạn cần nhắm mắt với độ khép rõ rệt (hơn 60% so với lúc mở mắt bình thường) để hệ thống ghi nhận là một cú click/drag, giúp tránh các cú chớp mắt sinh lý vô tình.