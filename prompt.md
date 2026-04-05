# CHỈ THỊ DÀNH CHO TRỢ LÝ AI: PHÁT TRIỂN GIAO DIỆN VÀ TÍNH NĂNG NGƯỜI DÙNG (USER UI/UX) - DỰ ÁN EYEMOTIONDETECT

## Ngữ cảnh dự án (Context)
Dự án là một ứng dụng Web tích hợp hệ thống AI Eye-Gaze Controller cho phép người dùng thao tác, thực hiện bài thi trắc nghiệm và huấn luyện điều khiển mắt (Eye tracking). Hệ thống sử dụng Next.js (App Router), Tailwind CSS, TypeScript và Shadcn UI. 

## Mục tiêu (Objective)
Hoàn thiện UI Design và các tính năng cốt lõi cho phân hệ Người dùng (User Site). 
Giao diện cần áp dụng các nguyên tắc thiết kế UX/UI chuyên biệt cho việc điều khiển bằng ánh mắt (gaze-friendly): các điểm neo (gaze targets) lớn, khoảng cách phần tử an toàn, độ tương phản cao, trạng thái focus/hover cực kỳ rõ ràng và hạn chế tối đa việc cuộn trang (scroll) phức tạp.

## 1. Định hướng Thiết kế (Design System & UX/UI)
- **Concept**: Tối giản (Minimalist), không gian rộng (Spacious) nhưng có tính tương tác cao. Có thể giữ sự gọn gàng tương tự trang Admin nhưng các action button ở User Site phải mang tính Sáng tạo và nổi bật hơn.
- **Feedback & Focus**: Bất kỳ phần tử nào có thể tương tác đều phải có hiệu ứng `focus-visible` hoặc `hover` rõ ràng (ví dụ: vòng loading bao quanh nút, thay đổi màu sắc mạnh) để người dùng biết mắt họ đang "nhìn" trúng mục tiêu.
- **Điều hướng (Navigation)**:
  - Khuyến nghị sử dụng **Gaze-friendly Sidebar** (thu gọn mặc định, tự động mở rộng khi mắt hướng về viền trái) hoặc một **Top-bar kết hợp với các nút Floating lớn**.
  - Cung cấp "Focus Mode" (ẩn toàn bộ Nav) khi người dùng đang thực hiện bài thi.

## 2. Cấu trúc Layout và Danh sách Trang (Pages Route)
Hãy thiết kế và viết code cho các trang sau trong hệ thống routing của Next.js:

1. **`/home` (Trang chủ tổng quan)**
   - Thống kê tiến độ học/thi.
   - Các nút "Call to Action" lớn: "Tiếp tục bài thi", "Luyện tập mắt".
   - Biểu đồ hoặc danh sách kết quả gần đây.
2. **`/training` (Huấn luyện & Hiệu chuẩn mắt)**
   - Tích hợp và tối ưu hóa component `CalibrationPanel`.
   - Giao diện hướng dẫn từng bước (Step-by-step wizard) để người dùng hiệu chỉnh chính xác hệ thống nhận diện.
3. **`/exams` (Danh sách bài thi)**
   - Hiển thị dạng Grid các Card bài thi (Tiêu đề, trạng thái, thời gian, số câu hỏi).
   - Bộ lọc đơn giản (chưa thi, đã hoàn thành).
4. **`/exams/[id]` (Thực hiện bài thi - Cốt lõi)**
   - Kích hoạt Focus Mode.
   - Giao diện dạng Pagination (1 hoặc một vài câu hỏi trên một màn hình để mắt dễ quét).
   - Tích hợp component `MCQBoard` kết hợp với hệ thống xác nhận đáp án bằng mắt (nhìn vào đáp án đủ lâu để chọn).
5. **`/results/[id]` (Kết quả bài thi)**
   - Phân tích điểm số, số câu đúng/sai.
   - Đánh giá thời gian hoàn thành và phản hồi về độ ổn định của mắt trong quá trình thi.
6. **`/profile` (Thông tin cá nhân)**
   - Quản lý thông tin tài khoản và xem lại lịch sử chi tiết.

## 3. Các Component Shadcn UI Cần Thiết
Dựa trên các component đã có (Button, Card, Dialog, Input, Label, Avatar, Tooltip...), hãy cài đặt bổ sung và sử dụng các component sau để nâng cấp UI:
- `Progress`: Thanh tiến trình (dùng cho thời gian làm bài, hoặc visual feedback khi mắt đang focus vào một nút).
- `Tabs`: Chuyển đổi qua lại giữa các nội dung (ví dụ: Bài thi mới / Lịch sử thi).
- `Badge`: Đánh dấu trạng thái (Đang diễn ra, Đã nộp, Điểm cao...).
- `Toast` (hoặc `Sonner`): Thông báo hệ thống nổi (pop-up không cản trở tầm nhìn).
- `Skeleton`: Hiệu ứng tải trang nhằm giảm cảm giác chờ đợi.
- `Carousel`: (Tùy chọn) Rất hữu ích nếu muốn lướt qua các câu hỏi thi bằng cách nhìn vào các mũi tên điều hướng lớn hai bên.

## 4. Các bước triển khai (Implementation Plan)
Vui lòng làm theo trình tự sau để cung cấp code:
1. **Thiết lập Layout**: Cung cấp code cho file `UserLayout.tsx` với thiết kế Navigation phù hợp cho việc điều khiển bằng mắt.
2. **Giao diện cốt lõi**: Xây dựng màn hình `/dashboard` và danh sách `/exams`.
3. **Tích hợp Eye-tracking vào UI bài thi**: Tạo trang `/exams/[id]` tập trung vào logic chọn đáp án bằng `MCQBoard`.
4. **Hoàn thiện luồng**: Viết trang kết quả và thông tin tài khoản.

## Yêu cầu Đầu ra đối với AI:
- Cung cấp code TypeScript/TSX chi tiết, tuân thủ Clean Code.
- Áp dụng triệt để Tailwind CSS cho việc căn chỉnh responsive và tạo hiệu ứng animation.
- Mỗi đoạn mã hoặc component quan trọng cần có giải thích ngắn gọn về cách nó tối ưu hóa trải nghiệm người dùng (UX) đối với hệ thống nhận diện chuyển động mắt.