# Eye Actions Mapping (MCQ Mode)

Tai lieu nay mo ta cach EyeMotionDetect anh xa gaze thanh hanh dong chon dap an trong giao dien MCQ 4 lua chon.

## Tong quan xu ly

He thong xu ly theo chuoi:

1. Trich xuat features tu khuon mat va iris.
2. Model du doan gaze (X, Y).
3. Bo classifier vung doi (X, Y) thanh region A/B/C/D/DEADZONE.
4. Bo dwell-time tinh thoi gian gaze lien tuc tren mot region.
5. Khi dat nguong dwell-time, trigger chon dap an.

## Dinh nghia region

| Region | Vi tri UI | Hanh dong |
| :--- | :--- | :--- |
| A | Goc tren ben trai | Chon dap an A khi du dwell-time |
| B | Goc tren ben phai | Chon dap an B khi du dwell-time |
| C | Goc duoi ben trai | Chon dap an C khi du dwell-time |
| D | Goc duoi ben phai | Chon dap an D khi du dwell-time |
| DEADZONE | Vung giua/ngoai vung lua chon | Khong lam gi |

## Dwell-time state machine

| Trang thai | Dieu kien vao | Dieu kien ra |
| :--- | :--- | :--- |
| Tracking | Co du lieu gaze hop le | Mat face hoac loi detect |
| Hovering Region | Gaze o A/B/C/D | Chuyen sang region khac hoac vao DEADZONE |
| Dwell Counting | Gaze giu lien tuc tren cung region | Dat nguong dwell-time hoac roi region |
| Selection Triggered | Dwell progress >= 100% | Reset timer va tiep tuc tracking |

## Tham so chinh

- Dwell-time mac dinh: 2000ms
- Khoang khuyen nghi: 1500ms den 2000ms
- Neu gaze vao DEADZONE: reset tien do dwell

## Visual feedback

- Moi o dap an hien progress theo dwell.
- Progress reset ngay khi user roi khoi region dang nhin.
- Khi du nguong, UI danh dau dap an da chon.

## Khac biet so voi co che cu

- MCQ mode uu tien dwell-time va region selection.
- Blink gesture khong phai co che chon dap an chinh trong man hinh MCQ.
- Muc tieu la on dinh va giam click nham do micro-saccades.
