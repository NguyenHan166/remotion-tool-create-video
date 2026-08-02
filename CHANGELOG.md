# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.1.0] - 2026-08-02

### Added

- **Project Dashboard**: Trực quan hóa danh sách các dự án đang hoạt động và dự án đã lưu trữ, với lưới hiển thị (grid) hiện đại.
- **Media Workspace**: Quản lý tập trung thư viện hình ảnh, video (MP4, WebM), âm thanh (MP3, WAV) với chức năng upload tối ưu, hỗ trợ chunking.
- **Video Editor (Scene-based)**: Trình chỉnh sửa video chia theo cảnh (scene-based) hỗ trợ Timeline, cho phép tuỳ chỉnh thời lượng từng cảnh một cách độc lập.
- **Remotion Render Engine**: Kiến trúc hệ thống worker-queue bằng PostgreSQL giúp kết xuất (render) video không giới hạn ngay trên máy local, tối ưu hoá với headless Chromium.
- **Audio Controls**: Hỗ trợ lồng tiếng (Voiceover) và nhạc nền (Background Music), điều chỉnh âm lượng, offset, tự động fade out.
- **Caption Generation**: Căn chỉnh và render phụ đề (Subtitles) từ file chuẩn SRT (import SRT) với nhiều phong cách hiển thị: Tiktok, News, Clean.
- **Docker Production Ready**: Cung cấp cấu hình Docker Compose chuẩn mực cho môi trường Windows, tích hợp CI/CD tự động phát hành Image lên Docker Hub thông qua GitHub Actions.
- **Runbooks & Operations**: Hướng dẫn chi tiết cách sao lưu (Backup) và phục hồi (Restore) data volume an toàn.

### Known Limitations (Hạn chế hiện tại)

- **Aspect Ratio**: Hiện tại hệ thống UI chỉ tối ưu hiển thị và xuất (render) video theo chuẩn 9:16 (dọc) như Tiktok/Reels/Shorts.
- **Multi-user / Authentication**: Hệ thống mang tính chất cá nhân, local-first. Không có hệ thống phân quyền đa người dùng, mọi người truy cập vào IP đều là Admin.
- **Hardware Acceleration**: Việc kết xuất qua FFMPEG và Remotion chạy phần lớn trên tài nguyên CPU, khả năng tăng tốc phần cứng (GPU) chưa được đảm bảo trên tất cả các loại card đồ họa Windows.
