# Test Cases — Blink Detector (Phase 1.3)

Script đánh giá: `evaluation/blink_evaluation.py`

Chạy tất cả: `python evaluation/blink_evaluation.py`
Chạy riêng lẻ: `python evaluation/blink_evaluation.py --tc <số>`

## Baseline Thresholds cho việc chấm PASS/FAIL

Trong giai đoạn hiện tại, script demo/evaluation dùng runtime default của `src/blink_detector.py`.

| Tham số              | Giá trị runtime đang dùng |
| -------------------- | ------------------------- |
| `blink_threshold`    | 0.21                      |
| `short_blink_min_ms` | 120                       |
| `short_blink_max_ms` | 400                       |
| `long_blink_min_ms`  | 600                       |
| `long_blink_max_ms`  | 2000                      |
| `cooldown_ms`        | 600                       |
| `consecutive_frames` | 3                         |

Lưu ý: `config/settings.yaml` hiện có một số giá trị mục tiêu khác runtime.
Khi pipeline chuyển sang đọc config đầy đủ, bảng baseline này phải cập nhật theo nguồn sự thật mới.

---

## TC-1 — False Positive Rate

**Mục tiêu:** Ngồi bình thường không cố ý click, hệ thống không được nhận nhầm.

|                    |                                                                            |
| ------------------ | -------------------------------------------------------------------------- |
| **Cách thực hiện** | Ngồi tự nhiên trước webcam trong **1 phút**, không cố ý chớp hoặc nhắm mắt |
| **Tiêu chí đạt**   | Tổng số click phát sinh < **2**                                            |
| **Thời gian**      | 60 giây                                                                    |

---

## TC-2 — Chớp Tự Nhiên Không Trigger

**Mục tiêu:** Chớp mắt bình thường hàng ngày không được tạo ra click.

|                    |                                             |
| ------------------ | ------------------------------------------- |
| **Cách thực hiện** | Chớp mắt tự nhiên liên tục trong **1 phút** |
| **Tiêu chí đạt**   | 0 click được tạo ra                         |
| **Thời gian**      | 60 giây                                     |

> **Lưu ý:** TC-1 và TC-2 khác nhau ở chỗ TC-2 bạn chủ động chớp liên tục, TC-1 thì ngồi yên tự nhiên.

---

## TC-3 — Short Blink Reliability (Click Trái)

**Mục tiêu:** Chớp mắt có chủ ý phải được nhận diện đủ số lần.

|                    |                                                                   |
| ------------------ | ----------------------------------------------------------------- |
| **Cách thực hiện** | Cố ý chớp mắt nhanh **20 lần**, mỗi lần nhắm rõ ràng (~200–350ms) |
| **Tiêu chí đạt**   | Nhận diện được ≥ **18/20**                                        |
| **Thời gian**      | Tối đa 120 giây                                                   |

**Lưu ý khi thực hiện:**

- Nhắm mắt rõ ràng, không chớp quá nhanh (cần ≥ 120ms)
- Chờ badge "OPEN" xuất hiện lại trước khi chớp lần tiếp theo

---

## TC-4 — Long Blink Reliability (Click Phải)

**Mục tiêu:** Nhắm mắt lâu khoảng 2 giây phải được nhận là click phải.

|                    |                                                     |
| ------------------ | --------------------------------------------------- |
| **Cách thực hiện** | Cố ý nhắm mắt khoảng **2 giây**, lặp lại **10 lần** |
| **Tiêu chí đạt**   | Nhận diện được ≥ **9/10**                           |
| **Thời gian**      | Tối đa 120 giây                                     |

**Lưu ý khi thực hiện:**

- Nhắm đủ lâu (600ms–2000ms), không nhắm quá 2 giây (sẽ bị bỏ qua)
- Chờ cooldown 600ms giữa các lần

---

## TC-5 — Phân Biệt Short vs Long

**Mục tiêu:** Hệ thống không nhầm loại click — short thì ra SHORT, long thì ra LONG.

|                    |                                                                    |
| ------------------ | ------------------------------------------------------------------ |
| **Cách thực hiện** | Làm **10 SHORT blink** trước, sau đó **10 LONG blink** theo thứ tự |
| **Tiêu chí đạt**   | Mỗi phase ≥ **9/10 đúng loại**                                     |
| **Thời gian**      | Tối đa 180 giây                                                    |

---

## Diễn giải kết quả

| Kết quả | Ý nghĩa                                                           |
| ------- | ----------------------------------------------------------------- |
| `PASS`  | Test case đạt tiêu chí                                            |
| `FAIL`  | Chưa đạt, cân nhắc điều chỉnh ngưỡng trong `config/settings.yaml` |
| `SKIP`  | Người dùng bỏ qua (nhấn ESC)                                      |

Kết quả chi tiết được lưu tự động dạng JSON tại `evaluation/blink_eval_<timestamp>.json`.

---

## Test Cases mở rộng cho Phase 2+ (Gaze / Mapping / Integration)

Phần này dùng cho giai đoạn rà soát và lập kế hoạch sản phẩm web/full-stack.

## TC-6 — Gaze Mapping Accuracy (sau calibration)

**Mục tiêu:** Kiểm tra sai số map từ gaze sang tọa độ màn hình sau khi fit mapper.

|                    |                                                                                 |
| ------------------ | ------------------------------------------------------------------------------- |
| **Cách thực hiện** | Chạy bài test 12 điểm (4x3), mỗi điểm giữ nhìn 2 giây, ghi cursor cuối mỗi điểm |
| **Tiêu chí đạt**   | MAE < **100px**, 90th percentile < **180px**                                    |
| **Thời gian**      | 3-5 phút                                                                        |

## TC-7 — Jitter Stability (nhìn cố định)

**Mục tiêu:** Đo độ rung cursor khi người dùng giữ mắt tại một điểm trung tâm.

|                    |                                                        |
| ------------------ | ------------------------------------------------------ |
| **Cách thực hiện** | Nhìn cố định vào tâm màn hình trong 10 giây, lặp 3 lần |
| **Tiêu chí đạt**   | Độ lệch chuẩn vị trí cursor < **20px**                 |
| **Thời gian**      | ~2 phút                                                |

## TC-8 — End-to-End Latency

**Mục tiêu:** Đo độ trễ toàn tuyến từ thay đổi gaze đến dịch chuyển cursor.

|                    |                                                                |
| ------------------ | -------------------------------------------------------------- |
| **Cách thực hiện** | Chuyển nhìn giữa 2 target xa nhau, đo thời gian cursor bắt kịp |
| **Tiêu chí đạt**   | End-to-end latency < **220ms**                                 |
| **Thời gian**      | 3 phút                                                         |

## TC-9 — Robustness khi mất mặt tạm thời

**Mục tiêu:** Xác nhận hệ thống không phát sinh hành vi nguy hiểm khi mất tracking.

|                    |                                                                 |
| ------------------ | --------------------------------------------------------------- |
| **Cách thực hiện** | Che camera hoặc quay mặt khỏi camera trong 3-5 giây rồi trở lại |
| **Tiêu chí đạt**   | Cursor dừng ổn định khi mất mặt, resume mượt khi nhận lại mặt   |
| **Thời gian**      | 2 phút                                                          |

## TC-10 — Session Persistence (khi có backend)

**Mục tiêu:** Kiểm tra khả năng lưu/tải calibration hoặc weights theo user.

|                    |                                                         |
| ------------------ | ------------------------------------------------------- |
| **Cách thực hiện** | Login -> dùng hệ thống -> logout -> login lại cùng user |
| **Tiêu chí đạt**   | Không cần calibrate lại, sai số vẫn trong ngưỡng TC-6   |
| **Thời gian**      | 3-5 phút                                                |

## Quality Gate đề xuất theo phase

| Phase     | Gate tối thiểu để qua phase                   |
| --------- | --------------------------------------------- |
| Phase 1   | TC-1..TC-5 đạt chuẩn                          |
| Phase 2-3 | TC-6 và TC-7 đạt chuẩn                        |
| Phase 4-6 | TC-8 và TC-9 đạt chuẩn                        |
| Phase 7+  | TC-10 đạt chuẩn (nếu có backend user profile) |
