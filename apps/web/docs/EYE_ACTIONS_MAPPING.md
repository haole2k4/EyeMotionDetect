# Hệ Thống Ánh Xạ Thao Tác Mắt (Eye Actions Mapping)

Tài liệu này định nghĩa cách hệ thống EyeMotionDetect chuyển đổi các chuyển động của mắt thành các thao tác chuột tương ứng trên hệ điều hành/trình duyệt.

## Nguyên lý cơ bản

Hệ thống sử dụng chỉ số **EAR (Eye Aspect Ratio)** để độ mở của mắt. Khi độ mở của mắt giảm xuống dưới một ngưỡng nhất định (threshold), hệ thống ghi nhận là mắt đang nhắm. 

Để phân biệt giữa các thao tác cố ý (lệnh) và phản xạ tự nhiên, chúng ta đo thời gian nhắm mắt (tính bằng ms).

## Các Tham số (Thresholds)

* **Ngưỡng chớp tự nhiên:** `< 200ms`
* **Ngưỡng thao tác nhanh (Click):** `200ms - 500ms`
* **Ngưỡng thao tác giữ (Hold/Drag):** `> 500ms`

## Bảng Ánh Xạ Thao Tác (Actions Map)

| Hành động của mắt | Khoảng thời gian | Thao tác chuột sinh ra | Giải thích / Ghi chú |
| :--- | :--- | :--- | :--- |
| **Chớp mắt tự nhiên** (Cả 2 mắt) | `< 200ms` | *(Bỏ qua - Không làm gì cả)* | Chớp mắt sinh lý tự nhiên. Hệ thống sẽ nội suy toạ độ chuột dựa trên các khung hình trước đò, tránh chuột bị giật hoặc nhảy lệch. |
| **Nhắm mắt trái** (Chỉ nhắm mắt trái) | `200ms - 500ms` | **Click trái (Left Click)** | Nháy mắt trái có chủ ý. Dùng cho các thao tác chọn, nhấn nút thông thường. |
| **Nhắm mắt phải** (Chỉ nhắm mắt phải) | `200ms - 500ms` | **Click phải (Right Click)** | Nháy mắt phải có chủ ý. Dùng để mở Menu chuột phải (Context Menu). |
| **Nhắm cả 2 mắt lâu** | `> 500ms` | **Khóa/Mở Khóa Kéo Thả (Toggle Drag & Drop)** | Nhắm cả 2 mắt hơn nửa giây để chuyển đổi trạng thái "đang giữ chuột" (Mouse Down) và "nhả chuột" (Mouse Up). Có phản hồi âm thanh (Beep) hoặc cảnh báo hình ảnh để người dùng nhận biết. |
| **Cử động đầu (Head pose)** | Tùy biến | **Cuộn trang (Scroll)** | Trạng thái cuộn được kích hoạt dựa trên việc ngửa đầu (Pitch lên) hoặc cúi đầu (Pitch xuống) với một góc độ đủ lớn. Hành động cuộn có thể đi kèm với biểu tượng cảnh báo trạng thái cuộn đang mở. |

## Quy Trình Xử Lý Tại Phase 6

1. Trích xuất **đặc trưng (Features)** từ lưới điểm mặt (Face Mesh landmarks). Tính giá trị EAR cho mắt trái và mắt phải độc lập. 
2. Bộ nhận diện chớp mắt **(`ear-detector.ts`)** liên tục giám sát và đo đạc thời lượng mỗi lần EAR tụt xuống dưới ngưỡng.
3. Khi mắt mở trở lại (EAR hồi phục trên ngưỡng), một "event" sẽ được đưa tới bộ xử lý. Event này chứa loại mắt nhúc nhích (Trái/Phải/Cả Hai) và thời gian nhắm kết thúc, từ đó map với bảng trên.
4. **Chuột** (có thể qua WebCursor overlay hoặc Bridge Native OS) sẽ được kích hoạt tương ứng. Để chống sai số (*false positive*), có thể yêu cầu khoảng chờ nhỏ (cooldown) giữa 2 sự kiện nhạy cảm (vd 500ms).
