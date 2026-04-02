# Calibration Guide

Tai lieu nay mo ta cach thuc hien hieu chinh trong app va cach he thong luu, huan luyen model sau moi vong lay mau.

## Cach thuc hien hieu chinh

1. Bat camera bang nut Start Eye Control.
2. Dam bao chi co 1 khuon mat trong khung hinh webcam.
3. Bam nut Bat dau Calibration.
4. Nhin vao diem tron hien tren man hinh va giu mat on dinh den khi chuyen sang diem tiep theo.
5. Hoan tat du 9 diem cua mot vong.
6. Sau moi vong, he thong se hoi ban co muon tiep tuc them vong nua hay khong.
7. Neu ban chon khong tiep tuc, he thong dung lap, luu mau va bat dau huan luyen.

## Vong lap calibration

- Moi vong co 9 diem (4 goc, 4 canh giua, 1 tam man hinh).
- Toi da 5 vong cho moi lan chay calibration.
- Sau moi vong, hop thoai xac nhan se hien de ban quyet dinh tiep tuc hoac ket thuc.

## Luu du lieu va huan luyen

- Du lieu mau calibration duoc luu trong IndexedDB voi key current.
- Moi lan calibration moi, he thong co the gop du lieu cu voi du lieu moi de train cong don.
- UI se hien so mau va so vong da luu de ban biet du lieu cu dang duoc giu lai.
- Sau khi ket thuc vong lap, he thong se:
  - fit polynomial va luu trong local storage calibration,
  - huan luyen MLP tren tap mau sau khi da gop du lieu (neu ban chon gop),
  - luu model MLP (json + weights) de su dung lai.
- Nut Reset Calibration Data se xoa toan bo du lieu calibration va model da luu, sau do dua he thong ve fallback mode.
- Neu co nhu cau luu file calibration trong thu muc du an, thu muc apps/web/.local-calibration/ da duoc dua vao gitignore.

## Khi nao can hieu chinh lai

- Sau khi doi vi tri ngoi.
- Sau khi doi webcam, man hinh, do sang phong.
- Khi thay con tro bi drift hoac mat do on dinh.

## Cong dung cua hieu chinh

Hieu chinh giup he thong hoc duoc dac trung mat cua chinh nguoi dung trong dieu kien thuc te, giam jitter va drift, mo rong khoang bao phu tu tam ra den cac mep man hinh, tang do chinh xac cho click/drag bang nhay mat va giup model MLP du doan on dinh hon trong su dung lau dai.
