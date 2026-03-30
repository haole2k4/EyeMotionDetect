# Hướng dẫn thu thập Dữ liệu Calibration (Calibration Data Collection)

Tài liệu này hướng dẫn cách thu thập dữ liệu (yaw, pitch) ứng với tọa độ (x, y) trên màn hình, giúp fit model polynomial regression thay thế chuyển động chuột. Ngoài ra còn lưu trữ hình ảnh mắt/khuôn mặt dự phòng để phục vụ việc fine-tune học sâu sau này nếu cần độ chính xác cực cao (Giải pháp B).

## Yêu cầu môi trường & Camera
- **Ánh sáng:** Đảm bảo nguồn sáng đều đặn chiếu vào mặt, không nên bị ngược sáng mạnh (ví dụ như ngồi xoay lưng vào cửa số buổi trưa).
- **Khoảng cách:** Ngồi yên vị ở khoảng cách **55 - 65cm** so với camera (đo lường xấp xỉ).
- **Camera:** Đặt ngay giữa màn hình phía trên cạnh trên màn hình. Nếu laptop, hãy dùng góc nghiêng màn hình quen thuộc hằng ngày của bạn.

## Cài đặt hiển thị (Quan trọng!)
- Màn hình sử dụng trong quá trình đo đạc nên là màn hình duy nhất/màn hình chính.
- Đối với **Windows với tỉ lệ Scale 125%** ở màn hình FHD (1920x1080), scripts thu thập đã được tích hợp DPI Awareness nhằm hiển thị đủ kích thước lưới 4x3 trên toàn màn hình vật lý.

## Quy trình thực hiện (Chạy Tool)
> Bạn hãy chạy dòng lệnh sau từ thư mục gốc của dự án:
> ```bash
> python -m src.calibration
> ```
Màn hình sẽ chuyển thành kích thước Toàn màn hình (Fullscreen) với phông nền xám và 1 dấu chấm đỏ.

1. Hãy nhìn tập trung vào hồng tâm (dấu thập) trong chấm đỏ.
2. Hệ thống sẽ đợi **1.2 giây** để mắt bạn ổn định, sau đó thu **20 frames**. Màn hình sẽ chớp xanh nhẹ khi đang thu.
3. Khi chấm đỏ nhảy sang điểm mới (theo thứ tự từ trái sang phải), hãy liếc mắt nhìn theo, nhưng lưu ý **hạn chế quay hẳn cả đầu, chủ yếu dùng chuyển động mắt** vì điểm mấu chốt là nhận diện Gaze.
4. Lặp lại qua 12 điểm lưới.

## Đề xuất Số lượng Bản ghi Cần thiết (Training Records)

Để bộ dữ liệu có đủ độ phủ, tránh hiện tượng overfitting khi fit thuật toán tuyến tính/đa thức (Polynomial Regression bậc 2):

- **Số Vòng Lặp (Reps):** Bạn nên thực hiện chạy script qua 12 điểm lưới từ **3 - 5 vòng (reps)**. Việc này có thể thực hiện thông qua config `samples_per_point` hoặc chạy lại Script 3-5 lần để gộp Data.
- **Tổng số Records cho mỗi cá nhân/môi trường:** Ít nhất **36 bản ghi đến 60 bản ghi** (Mỗi bản ghi đại diện cho 20 frames với (yaw, pitch) ở mỗi mức, lấy giá trị trung vị).
- **Lượng Ảnh dataset dự phòng:** Với quy mô 60 bản ghi (mỗi bản 20 frames), bạn sẽ có khoảng **1200 ảnh khuôn mặt/mắt** (cropped images) với lable (x, y) chuẩn, cực kỳ giá trị để dùng cho fine-tune (Giải Pháp B).
  
> [!NOTE]
> File JSON metadata và tất cả ảnh thu được sẽ được tự động lưu trong thư mục `calibration/dataset/` kết hợp với TimeStamp. Folder này đã được loại trừ khỏi git để tránh đầy kho lưu trữ.
