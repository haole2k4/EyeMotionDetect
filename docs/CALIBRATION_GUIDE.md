# Calibration Guide

Tai lieu nay mo ta quy trinh calibration moi cho he thong MCQ 4 lua chon dieu khien bang mat.

## Muc tieu calibration

Calibration duoc toi gian thanh 4 diem de giam thoi gian huan luyen va tang do on dinh cho bai toan chon vung (region-based), khong theo duoi toa do pixel chinh xac.

## Quy trinh calibration 4 diem

1. Dang nhap user thuong (role user).
2. Bat camera va dam bao chi co 1 khuon mat trong khung hinh.
3. Bam Bat dau Calibration.
4. Nhin lan luot vao 4 diem dai dien cho 4 goc:
   - A: Top-Left
   - B: Top-Right
   - C: Bottom-Left
   - D: Bottom-Right
5. Giu mat on dinh tai moi diem den khi he thong chuyen diem tiep theo.
6. Ket thuc vong lay mau, he thong huan luyen model va luu ket qua.

## Anh xa khong gian sau calibration

Sau khi model du doan gaze (X, Y), he thong se anh xa vao 5 trang thai:

- A
- B
- C
- D
- DEADZONE

Neu gaze roi vao DEADZONE thi khong kich hoat chon dap an.

## Dwell-time selection

- He thong khong dung blink-to-click de chon dap an MCQ.
- Khi gaze o lien tuc tren mot lua chon A/B/C/D trong khoang 1.5 - 2.0 giay, he thong trigger chon dap an.
- UI co progress indicator de hien thi tien do dwell-time.

## Luu du lieu calibration

- Du lieu calibration va model duoc luu local de tai su dung nhanh.
- Trong backend, trang thai da calibration cua user duoc xac dinh qua du lieu weights.
- User chua co weights se bi buoc calibration truoc khi vao man hinh MCQ.

## Khi nao can calibration lai

- Doi vi tri ngoi hoac goc dat webcam.
- Doi man hinh, do phan giai, hoac dieu kien anh sang.
- He thong nhan nham vung A/B/C/D thuong xuyen.

## Khuyen nghi de calibration on dinh

- Ngoi cach webcam on dinh, mat trong tam khung hinh.
- Khong quay dau nhanh trong luc lay mau.
- Lam lai calibration neu vua thay doi moi truong su dung.
