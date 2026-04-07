# Định tuyến Hành động Mắt (Gaze Actions Mapping)

Tài liệu này mô tả chi tiết cách hệ thống EyeMotionDetect phân giải tọa độ vật lý sang ma trận lưới tĩnh và thực thi các thao tác điều khiển mắt (gaze-based interaction) trên nền tảng lưới 3x3.

## 1. Dòng chảy Toán học (Pipeline)

1. **Feature Extraction**: Trích xuất các vị trí Iris và Head Pose từ MediaPipe.
2. **Gaze Prediction**: Chạy tọa độ qua mô hình Học máy (Polynomial Ridge Regression / MLP Matrix Neural Network) để lấy tọa độ màn hình `{ x, y }` dạng pixel.
3. **Soft Clamping**: Giới hạn dải dữ liệu một cách tuyến tính để tránh nhiễu lọt khỏi vùng màn hình hiển thị.
4. **Grid Mapping**: Chạy hàm `getGridCell(x, y, w, h)` để phân vùng màn hình vào một ma trận số nguyên `[0..2, 0..2]` theo 3 hàng và 3 cột cân bằng.
5. **Action Dictionary**: Chuyển đổi tuple `{row, col}` nguyên thành `RegionId` (chuỗi chuỗi hành động).
6. **Dwell Time Tracker**: Đóng gói `RegionId` vào Tracker 2000ms. Tiến trình gửi sự kiện `click` tự động lên DOM nếu thỏa mãn thời gian.

## 2. Bố cục Ma trận Hành động (Grid 3x3)

Toàn bộ các Action khả dụng được cứng hóa thành một ma trận như sau:

| (Row, Col) | Khu vực Vật lý | Mã Hành Động (RegionId)| Mô tả Chức năng |
| :--- | :--- | :--- | :--- |
| `0, 0` | Góc Trái Trên | **A** | Chọn Đáp án A |
| `0, 1` | Giữa Trên | **PREV** | Quay lại Câu trước |
| `0, 2` | Góc Phải Trên | **B** | Chọn Đáp án B |
| `1, 0` | Giữa Trái | **SAFE_MARGIN** | Lề an toàn cho mắt, **được miễn trừ vòng lặp Dwell-time**. |
| `1, 1` | Tâm Màn hình | **DEADZONE** | Khu vực hiển thị bảng câu hỏi, **được miễn trừ vòng lặp Dwell-time**. |
| `1, 2` | Giữa Phải | **NEXT** | Đi đến Câu tiếp theo |
| `2, 0` | Góc Trái Dưới | **C** | Chọn Đáp án C |
| `2, 1` | Giữa Dưới | **SUBMIT** | Nộp bài toàn phần |
| `2, 2` | Góc Phải Dưới | **D** | Chọn Đáp án D |

## 3. Quản lý Dwell-Time Linh hoạt (Dynamic Dwell-Time)

Chống chạm nhầm (Midas Touch) vốn là cội nguồn của hành vi sai sót ở Gaze Control. Để giải quyết, Dwell-Time giờ đây được đính kèm thẳng vào bên trong GazeProvider, cho phép quản lý thời gian linh động dựa trên nguyên tắc Fitts's Law.

- **Trigger Interval Mặc định**: Quá trình chờ mặc định từ lúc mắt nhảy sang ô mới đến lúc gọi DOM Mousedown Click là `1500ms`.
- **Trigger Interval Phá hủy**: Mất `3000ms` (3 giây) chuyên dụng cho hành động `SUBMIT` (Nộp bài) để tránh nộp nhầm.
- **Trường hợp Ngoại Lệ (Vùng An Toàn)**: Bất cứ khi nào tọa độ rơi vào `DEADZONE` (Khu đọc đề) hoặc `SAFE_MARGIN` (Lề an nghỉ tay/mắt), tiến trình Dwell-Time lập tức gỡ bỏ cờ ghi nhớ và xả Timer về 0. Điều này nhằm giữ cho người dùng không bị click nhầm khi đang đọc hoặc nghỉ mắt.
- **Tiến độ Hiển thị**: Mọi Component `GazeButton` đều được kết nối thẳng với thuộc tính `stats.dwellProgress` (nhận giá trị từ `0` tới `1`) để bôi màu Progress Bar song song với lõi.

## 4. Tương tác Thêm (Extended Actions)

Mặc dù hệ thống 3x3 Grid bao phủ gần hết công năng của bài kiểm tra, cơ chế Blink (Nháy mắt) vẫn được duy trì như một lựa chọn "Click" thay thế. Người dùng có thể chủ động ngắt cài đặt Dwell-Time và chớp để click trực tiếp vào một ô họ đang nhìn.
