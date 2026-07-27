# HanSYS Video Studio — Remotion Build Pack v1

Bộ tài liệu này là đầu vào chính thức để Codex xây dựng công cụ tạo video cá nhân bằng Remotion.

## Mục tiêu

Người dùng tự viết kịch bản ở bên ngoài, sau đó:

1. Tạo project.
2. Dán kịch bản hoặc chia nội dung thành scene.
3. Chọn template.
4. Gắn ảnh, video, voice-over, nhạc nền và phụ đề.
5. Xem trước bằng Remotion Player.
6. Tạo render job.
7. Worker xuất MP4.
8. Tải kết quả về máy.

## Các quyết định đã khóa

- Local-first, chạy bằng Docker Compose.
- Một người dùng, chưa cần đăng nhập.
- Không có AI viết kịch bản trong MVP.
- Editor theo scene, không làm timeline kiểu CapCut trong MVP.
- Next.js đảm nhiệm giao diện và HTTP API.
- Remotion Player dùng cho preview.
- Worker Node.js riêng dùng `@remotion/renderer`.
- PostgreSQL lưu project, revision, asset metadata và render queue.
- File media nằm trong Docker named volume.
- Project là JSON có version; template là code React có version.
- Render luôn đọc immutable revision, không đọc bản nháp đang chỉnh sửa.
- Không gọi `bundle()` cho từng video; bundle được cache theo source hash.
- Tất cả package Remotion phải cùng một phiên bản chính xác.
- Phiên bản mục tiêu khi bộ tài liệu được tạo: `4.0.499`.
- Việc nâng phiên bản Remotion phải là một commit riêng.

## Thứ tự đọc

1. `docs/01_PRODUCT_SPEC.md`
2. `docs/02_TECHNICAL_ARCHITECTURE.md`
3. `docs/03_PROJECT_DOCUMENT_SCHEMA.md`
4. `docs/04_DATABASE_SCHEMA.md`
5. `docs/05_API_CONTRACT.md`
6. `docs/06_RENDER_PIPELINE.md`
7. `docs/07_TEMPLATE_SDK.md`
8. `docs/08_DOCKER_DEPLOYMENT.md`
9. `docs/09_TEST_STRATEGY.md`
10. `docs/10_TASKS_BY_COMMIT.md`
11. `docs/11_CODEX_BOOTSTRAP_PROMPT.md`

## File có thể dùng trực tiếp

- `packages/database/prisma/schema.prisma`: Prisma schema đang được ứng dụng sử dụng.
- `schemas/openapi.yaml`: OpenAPI 3.1 contract.
- `schemas/project.schema.json`: JSON Schema của ProjectDocument.
- `examples/project.example.json`: project mẫu.
- `docker/compose.example.yaml`: Docker Compose production mẫu.
- `.env.example`: biến môi trường mẫu.

## Mốc MVP quan trọng nhất

```text
Create project
→ Add/edit scenes
→ Preview in Remotion Player
→ Queue render
→ Worker renders MP4
→ Download MP4
```

Không đầu tư hiệu ứng đẹp hoặc template thứ hai trước khi luồng trên chạy end-to-end.

## Lệnh kiểm tra mặc định

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:video
pnpm test:e2e
docker compose config
```
