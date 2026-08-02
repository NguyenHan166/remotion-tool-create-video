# HanSYS Video Studio — Release Checklist

Bảng kiểm tra (checklist) này giúp đảm bảo chất lượng hệ thống (Quality Assurance) mỗi khi chúng ta muốn phát hành (release) một phiên bản mới.

## Chuẩn bị Phát hành (Release Preparation)

### 1. Cập nhật Code & Tài liệu
- [ ] Codebase đã được merge vào nhánh `main` và xử lý hết tất cả merge conflicts (nếu có).
- [ ] File `CHANGELOG.md` đã được bổ sung nội dung các thay đổi mới ở phần Unreleased và đánh version number (VD: `v0.2.0`).
- [ ] Tất cả tài liệu hướng dẫn (`docs/11_RUNBOOKS.md`, `.env.example`) đã được cập nhật nếu có biến môi trường mới hoặc tính năng thay đổi luồng hoạt động.

### 2. Kiểm tra Gates & Tests (Automated QA)
- [ ] **Linting:** Chạy `pnpm format:check` và `pnpm lint` không có lỗi.
- [ ] **Typecheck:** Chạy `pnpm typecheck` thành công.
- [ ] **Unit & Integration:** `pnpm test` (kể cả API tests) chạy pass 100%.
- [ ] **Video Rendering Check:** Lệnh `pnpm test:video` (Smoke Test render) hoàn thành thành công và không bị gián đoạn giữa chừng.

### 3. Kiểm tra UI/UX & E2E (Manual QA)
- [ ] Có thể Upload và Xóa file trong **Media Workspace** mượt mà.
- [ ] **Dashboard:** Nút "Tạo Dự Án" tạo thành công và chuyển thẳng vào Editor.
- [ ] **Scene Editor:** Timeline cho phép thêm/sửa/xóa cảnh, chỉnh sửa độ dài, thêm Audio thành công.
- [ ] **Kết xuất thực tế (Representative Render Pass):**
  - Thực hiện render 1 video mẫu tỷ lệ 1080x1920 có đủ hiệu ứng, sub và audio. 
  - Tải về thành công MP4. Check xem MP4 có âm thanh và chạy bình thường không.

## Quy trình Đánh Tag & Phát hành (Tag & Publish)

### 4. Git Tagging & CI/CD Push
Sau khi mọi thứ hoạt động chuẩn, tiến hành đánh Git Tag theo chuẩn Semantic Versioning (`vX.Y.Z`).

```bash
# Xem xét các thay đổi cuối cùng
git status

# Commit các thay đổi (chủ yếu là CHANGELOG)
git commit -m "release: prepare vX.Y.Z"

# Đánh tag phiên bản
git tag -a vX.Y.Z -m "Release version X.Y.Z"

# Đẩy code và tag lên GitHub (Action CI/CD sẽ tự động chạy)
git push origin main
git push origin vX.Y.Z
```

### 5. Xác nhận CI/CD & Docker Hub
- [ ] Lên trang **Actions** trên GitHub Repo, theo dõi tiến trình chạy Pipeline CI/CD. Đảm bảo toàn bộ quy trình `test` và `build-and-push` hiển thị tick xanh.
- [ ] Lên trang **Docker Hub**, kiểm tra trong thẻ **Tags** của repository xem thẻ `vX.Y.Z` đã xuất hiện chưa.

## Sau Phát hành (Post-Release)
- Cập nhật thông báo release tới nội bộ (hoặc khách hàng).
- Chuẩn bị tạo nhãn mới `[Unreleased]` trong `CHANGELOG.md` để ghi nhận các tính năng tiếp theo.
