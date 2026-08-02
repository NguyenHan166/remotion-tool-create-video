# HanSYS Video Studio — Runbooks & Operations Guide

Tài liệu này hướng dẫn cách cài đặt, vận hành, sao lưu và khôi phục hệ thống HanSYS Video Studio trên môi trường Windows sử dụng Docker Desktop.

---

## 1. Cài đặt hệ thống (Installation)

### Yêu cầu hệ thống (System Requirements)
- **Hệ điều hành**: Windows 10/11 64-bit.
- **Phần mềm**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) đã bật WSL 2 backend.
- **Phần cứng đề xuất**: Tối thiểu 8GB RAM (Khuyên dùng 16GB) và ổ cứng SSD còn trống tối thiểu 50GB.

### Các bước triển khai (Deployment Steps)
1. Cài đặt Docker Desktop và đảm bảo Docker daemon đang chạy (icon chú cá voi ở khay hệ thống hiển thị màu xanh).
2. Tải mã nguồn dự án về máy, hoặc copy file `docker/compose.prod.yaml` và `.env.example`.
3. Đổi tên file `.env.example` thành `.env` và thiết lập các biến môi trường:
   ```env
   # Nhập đúng Username Docker Hub của bạn chứa Image
   APP_IMAGE=your-dockerhub-username/hansys-video-studio
   APP_VERSION=v0.1.0
   
   # Thay đổi mật khẩu an toàn
   POSTGRES_PASSWORD=my_secure_password
   ```
4. Mở Terminal (PowerShell, Command Prompt, hoặc Git Bash) tại thư mục gốc của dự án.
5. Khởi chạy hệ thống bằng file cấu hình production:
   ```bash
   docker compose --env-file .env -f docker/compose.prod.yaml up -d
   ```
7. Truy cập ứng dụng qua trình duyệt: `http://localhost:3000`.

---

## 2. Sao lưu dữ liệu (Backup)

Hệ thống lưu trữ trạng thái tại 2 Data Volumes:
- `hansys-video-studio_postgres_data`: Lưu trữ Database (PostgreSQL).
- `hansys-video-studio_video_data`: Lưu trữ các file videos, ảnh, audio, JSON renders,...

### Hướng dẫn Backup trên Windows
Cách an toàn nhất để sao lưu volume trên Docker Windows là sử dụng một container phụ (`alpine` hoặc `ubuntu`) kết nối (mount) vào volume hiện tại và nén dữ liệu ra một thư mục trên máy tính Host.

1. **Tạm dừng hệ thống để tránh ghi dữ liệu lỗi trong lúc backup:**
   ```cmd
   docker compose --env-file .env -f docker/compose.prod.yaml stop
   ```

2. **Backup PostgreSQL Database Volume:**
   (Lưu vào thư mục `C:\Backups` trên máy tính của bạn)
   ```cmd
   docker run --rm -v hansys-video-studio_postgres_data:/volume -v C:\Backups:/backup alpine tar -czvf /backup/postgres_backup.tar.gz -C /volume ./
   ```

3. **Backup Video & Assets Volume:**
   ```cmd
   docker run --rm -v hansys-video-studio_video_data:/volume -v C:\Backups:/backup alpine tar -czvf /backup/video_data_backup.tar.gz -C /volume ./
   ```

4. **Khởi động lại hệ thống:**
   ```cmd
   docker compose --env-file .env -f docker/compose.prod.yaml start
   ```

---

## 3. Khôi phục dữ liệu (Restore)

Nếu hệ thống bị sập hoặc bạn muốn di chuyển sang máy tính Windows khác, bạn có thể khôi phục từ các file `.tar.gz` đã backup.

1. **Xóa toàn bộ hệ thống hiện hành (nếu có):**
   ```cmd
   docker compose --env-file .env -f docker/compose.prod.yaml down -v
   ```

2. **Khởi tạo Volumes trống mới (nếu chưa có):**
   ```cmd
   docker volume create hansys-video-studio_postgres_data
   docker volume create hansys-video-studio_video_data
   ```

3. **Khôi phục PostgreSQL Database Volume:**
   ```cmd
   docker run --rm -v hansys-video-studio_postgres_data:/volume -v C:\Backups:/backup alpine sh -c "cd /volume && tar -xzvf /backup/postgres_backup.tar.gz"
   ```

4. **Khôi phục Video & Assets Volume:**
   ```cmd
   docker run --rm -v hansys-video-studio_video_data:/volume -v C:\Backups:/backup alpine sh -c "cd /volume && tar -xzvf /backup/video_data_backup.tar.gz"
   ```

5. **Khởi chạy lại hệ thống bình thường:**
   ```cmd
   docker compose --env-file .env -f docker/compose.prod.yaml up -d
   ```

---

## 4. Cập nhật và Hoàn tác (Update & Rollback)

### Cập nhật lên phiên bản mới (Update)
1. Mở file `.env` và sửa biến `APP_VERSION` thành phiên bản mới (VD: từ `v0.1.0` thành `v0.1.1`).
2. Kéo (Pull) image mới nhất về máy:
   ```cmd
   docker compose --env-file .env -f docker/compose.prod.yaml pull
   ```
3. Chạy lại stack:
   ```cmd
   docker compose --env-file .env -f docker/compose.prod.yaml up -d
   ```
> **Lưu ý:** Tiến trình `migrate` (được định nghĩa trong docker-compose) sẽ tự động chạy trước, áp dụng toàn bộ các thay đổi vào cấu trúc Database (nếu có) trước khi cho phép web và worker khởi động. Bạn không cần chạy lệnh migrate thủ công.

### Hoàn tác (Rollback)
Nếu phiên bản mới bị lỗi và bạn cần quay lại phiên bản cũ:
1. Sửa biến `APP_VERSION` trong `.env` về lại phiên bản cũ (VD: `v0.1.0`).
2. Khởi động lại stack:
   ```cmd
   docker compose -f docker/compose.prod.yaml up -d
   ```

> **Cảnh báo quan trọng khi Rollback:**
> Nếu bản update mới đã thay đổi cấu trúc dữ liệu (Database Migrations) và bạn downgrade phiên bản ứng dụng xuống, code cũ có thể không tương thích với cấu trúc Database mới.
> **Khuyên dùng:** Nếu rollback, hãy thực hiện lệnh Restore (Khôi phục) lại file backup `postgres_backup.tar.gz` mà bạn đã lưu trước lúc Update để đảm bảo đồng bộ hoàn toàn.
