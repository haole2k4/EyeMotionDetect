# Backend Development Guide

Tài liệu này mô tả cách chạy backend, chạy dịch vụ database bằng Docker và kết nối pgAdmin4 trong môi trường local.

## 1. Chuẩn bị môi trường

- Node.js: 22.14.0+
- pnpm: 10.18.2+
- Docker Desktop

Cài dependencies toàn workspace từ thư mục gốc:

```bash
pnpm install
```

## 2. Khởi động PostgreSQL + pgAdmin4

Lần đầu (hoặc khi cần dựng mới container):

```bash
docker compose -f docker-compose.dev.yml up -d
```

Chạy lại nhanh các container đã có:

```bash
docker start eyemotiondetect eyemotiondetect-pgadmin
```

Dừng container:

```bash
docker stop eyemotiondetect-pgadmin eyemotiondetect
```

## 3. Cấu hình truy cập

### PostgreSQL

- Host (từ máy local): localhost
- Port: 5432
- Database: gaze_dev
- Username: gaze
- Password: gaze_dev_pass

### pgAdmin4

- URL: http://localhost:5050
- Email mặc định: admin@eyemotiondetect.dev
- Password mặc định: admin123456

## 4. Kết nối server trong pgAdmin4

Server PostgreSQL đã được auto-import từ file `docker/pgadmin/servers.json`.

Sau khi đăng nhập pgAdmin4, bạn sẽ thấy sẵn server:

- Name: EyeMotionDetect Local
- Host: postgres
- Port: 5432
- Username: gaze

Lần đầu mở connection, nhập password: `gaze_dev_pass`.

Nếu không thấy server (thường do volume pgAdmin cũ đã tồn tại trước khi thêm `servers.json`), chạy lại theo thứ tự:

```bash
docker compose -f docker-compose.dev.yml down
docker volume rm eyemotiondetect_pgadmin-data
docker compose -f docker-compose.dev.yml up -d
```

## 5. Lệnh chạy backend cho dev

Từ thư mục gốc dự án:

```bash
pnpm --filter api dev
```

Hoặc vào trực tiếp app backend:

```bash
cd apps/api
pnpm dev
```

Build backend:

```bash
pnpm --filter api build
```

Run toàn bộ monorepo (web + api):

```bash
pnpm dev
```

## 6. Auth va role trong local dev

Backend se tu dong tao tai khoan admin mac dinh neu chua ton tai:

- Username/Email: admin@eyemotiondetect.dev
- Password: admin
- Role: admin

Luu y: Day la tai khoan cho he thong ung dung (NestJS auth), khong phai tai khoan dang nhap pgAdmin.

Neu can tao hoac nang quyen admin thu cong ngay trong Postgres, chay:

```bash
docker exec eyemotiondetect psql -U gaze -d gaze_dev -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS role character varying NOT NULL DEFAULT 'user';"
docker exec eyemotiondetect psql -U gaze -d gaze_dev -c "INSERT INTO users (email, \"passwordHash\", role) VALUES ('admin@eyemotiondetect.dev', '$2b$10$7bI25/luk9vIvBW0xWa8AOqRq90x8UWa9S4HB32BbUkrA8ixDJWNO', 'admin') ON CONFLICT (email) DO UPDATE SET role = 'admin';"
```

## 7. Kiem tra nhanh API

Sau khi backend chay, co the test nhanh:

1. Dang nhap admin de lay access token.
2. Goi GET /users voi Bearer token admin de xem danh sach users va trang thai calibration.
3. Goi POST /users voi Bearer token admin de tao test user.

Vi du payload tao user:

{
	"email": "test01",
	"password": "123456"
}

## 8. Migrations (tuỳ chọn)

Nếu cần chạy migration thủ công:

```bash
cd apps/api
pnpm typeorm migration:run -d src/data-source.ts
```
