# Test Cases — Blink Detector (Phase 1.3)

Script đánh giá: `evaluation/blink_evaluation.py`

Chạy tất cả: `python evaluation/blink_evaluation.py`  
Chạy riêng lẻ: `python evaluation/blink_evaluation.py --tc <số>`

---

## TC-1 — False Positive Rate

**Mục tiêu:** Ngồi bình thường không cố ý click, hệ thống không được nhận nhầm.

| | |
|--|--|
| **Cách thực hiện** | Ngồi tự nhiên trước webcam trong **1 phút**, không cố ý chớp hoặc nhắm mắt |
| **Tiêu chí đạt** | Tổng số click phát sinh < **2** |
| **Thời gian** | 60 giây |

---

## TC-2 — Chớp Tự Nhiên Không Trigger

**Mục tiêu:** Chớp mắt bình thường hàng ngày không được tạo ra click.

| | |
|--|--|
| **Cách thực hiện** | Chớp mắt tự nhiên liên tục trong **1 phút** |
| **Tiêu chí đạt** | 0 click được tạo ra |
| **Thời gian** | 60 giây |

> **Lưu ý:** TC-1 và TC-2 khác nhau ở chỗ TC-2 bạn chủ động chớp liên tục, TC-1 thì ngồi yên tự nhiên.

---

## TC-3 — Short Blink Reliability (Click Trái)

**Mục tiêu:** Chớp mắt có chủ ý phải được nhận diện đủ số lần.

| | |
|--|--|
| **Cách thực hiện** | Cố ý chớp mắt nhanh **20 lần**, mỗi lần nhắm rõ ràng (~200–350ms) |
| **Tiêu chí đạt** | Nhận diện được ≥ **18/20** |
| **Thời gian** | Tối đa 120 giây |

**Lưu ý khi thực hiện:**
- Nhắm mắt rõ ràng, không chớp quá nhanh (cần ≥ 120ms)
- Chờ badge "OPEN" xuất hiện lại trước khi chớp lần tiếp theo

---

## TC-4 — Long Blink Reliability (Click Phải)

**Mục tiêu:** Nhắm mắt lâu khoảng 2 giây phải được nhận là click phải.

| | |
|--|--|
| **Cách thực hiện** | Cố ý nhắm mắt khoảng **2 giây**, lặp lại **10 lần** |
| **Tiêu chí đạt** | Nhận diện được ≥ **9/10** |
| **Thời gian** | Tối đa 120 giây |

**Lưu ý khi thực hiện:**
- Nhắm đủ lâu (600ms–2000ms), không nhắm quá 2 giây (sẽ bị bỏ qua)
- Chờ cooldown 600ms giữa các lần

---

## TC-5 — Phân Biệt Short vs Long

**Mục tiêu:** Hệ thống không nhầm loại click — short thì ra SHORT, long thì ra LONG.

| | |
|--|--|
| **Cách thực hiện** | Làm **10 SHORT blink** trước, sau đó **10 LONG blink** theo thứ tự |
| **Tiêu chí đạt** | Mỗi phase ≥ **9/10 đúng loại** |
| **Thời gian** | Tối đa 180 giây |

---

## Diễn giải kết quả

| Kết quả | Ý nghĩa |
|---------|---------|
| `PASS` | Test case đạt tiêu chí |
| `FAIL` | Chưa đạt, cân nhắc điều chỉnh ngưỡng trong `config/settings.yaml` |
| `SKIP` | Người dùng bỏ qua (nhấn ESC) |

Kết quả chi tiết được lưu tự động dạng JSON tại `evaluation/blink_eval_<timestamp>.json`.
