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

### Các bước
1. Màn hình sẽ chuyển **Fullscreen** với phông nền xám. Nhấn **phím bất kỳ** để bắt đầu (hoặc **Escape** để thoát).
2. Một **chấm tròn đỏ + dấu thập trắng** sẽ xuất hiện — hãy nhìn tập trung vào hồng tâm.
3. Hệ thống đợi **1.2 giây** để mắt ổn định, sau đó chấm chuyển **xanh lá** và thu **20 frames**.
4. Chấm nhảy sang điểm tiếp theo (trái → phải, trên → dưới). Hãy **liếc mắt** theo, hạn chế quay đầu.
5. Mỗi vòng lặp đi qua **12 điểm** (lưới 4×3).

### Luồng vòng lặp (Rounds)
| Vòng | Hành vi |
|------|---------|
| 1 → 3 | **Bắt buộc** — chạy tự động, không hỏi |
| 4 | Hiện hộp thoại hỏi: *"Bạn có muốn thu thêm vòng 4?"* |
| 5 | Hiện hộp thoại hỏi: *"Bạn có muốn thu thêm vòng 5?"* |
| Sau vòng 5 | **Kết thúc** — hiển thị tổng kết và đóng |

> Bạn có thể nhấn **Escape** bất cứ lúc nào. Nếu đã có data, hệ thống sẽ **lưu lại** dữ liệu đã thu trước khi thoát.

## Đề xuất Số lượng Bản ghi Cần thiết (Training Records)

Để bộ dữ liệu có đủ độ phủ, tránh hiện tượng overfitting khi fit Polynomial Regression bậc 2:

| Thông số | Giá trị đề xuất | Ghi chú |
|----------|-----------------|---------|
| Số điểm lưới | 12 (4×3) | Phủ 4 góc + trung tâm |
| Số vòng tối thiểu | **3** (bắt buộc) | 36 mẫu — đủ cho fit cơ bản |
| Số vòng khuyến nghị | **5** | 60 mẫu — model ổn định, ít overfit |
| Frames / mẫu | 20 | Lấy median để loại nhiễu |
| Tổng ảnh khuôn mặt (5 vòng) | ~**1200 ảnh** | Dùng cho fine-tune Giải pháp B |

- **36 mẫu (3 vòng):** Đủ để fit Polynomial bậc 2 (6 hệ số × 2 trục = 12 tham số, 36 >> 12).
- **60 mẫu (5 vòng):** Cho phép held-out validation (~12 mẫu test) và giảm thiểu ảnh hưởng nhiễu.
- **Ảnh dataset dự phòng:** Với 60 bản ghi × 20 frames = **1200 ảnh** khuôn mặt đã crop cùng label `(screen_x, screen_y)` — cực kỳ giá trị cho fine-tune (Giải pháp B).
  
> [!NOTE]
> File JSON metadata và tất cả ảnh thu được được tự động lưu trong `calibration/dataset/`. Folder này đã được loại trừ khỏi git (`.gitignore`) để tránh đầy kho lưu trữ.
