# 08 — Docker Deployment and Operations

## 1. Services

- `web`
- `worker`
- `db`
- optional one-shot `migrate`

Web and worker are built from the same repository revision and exact lockfile.

## 2. Persistent volumes

```text
postgres_data → /var/lib/postgresql/data
video_data    → /data
```

`/data` layout:

```text
/data/
├── assets/
├── renders/
├── thumbnails/
├── bundles/
├── temp/
└── logs/
```

## 3. Environment variables

See `.env.example`.

Important:

- `APP_VERSION`
- `DATABASE_URL`
- `DATA_DIR`
- `MAX_UPLOAD_MB`
- `RENDER_JOB_CONCURRENCY`
- `RENDER_FRAME_CONCURRENCY`
- `RENDER_STALE_AFTER_MINUTES`
- `RENDER_MAX_ATTEMPTS`

## 4. Production image

Multi-stage:

1. `base`
2. `deps`
3. `builder`
4. `runner`

Runner requirements:

- Node.js runtime.
- FFmpeg/ffprobe.
- Browser dependencies.
- Remotion browser preparation according to the pinned version.
- Vietnamese fonts.
- Tini or equivalent init.
- Writable `/data`.
- No source volume mount.
- No install at container startup.

## 5. Startup order

1. Database health.
2. Migration one-shot acquires an advisory lock and migrates.
3. Web starts.
4. Worker starts.
5. Worker runs doctor checks and heartbeat.

Do not let both web and worker race to run migrations.

## 6. Health

Web:

```text
GET /api/v1/health
```

Worker heartbeat fields:

- worker ID.
- app version.
- Remotion version.
- status.
- current job ID.
- last seen time.
- FFmpeg available.
- browser available.
- writable storage.

## 7. Upgrade

```bash
docker compose pull
docker compose run --rm migrate
docker compose up -d
docker image prune -f
```

Before upgrade:

- Backup database.
- Backup `/data`.
- Record current image tag.

Use version tags for rollback, not only `latest`.

## 8. Backup

Database:

```bash
docker compose exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  > backup/database.sql
```

Data:

- Stop worker or ensure no active render.
- Archive the `video_data` volume.
- Preserve file ownership and paths.

The project requires both database and data volume for a complete restore.

## 9. Restore

1. Stop web and worker.
2. Restore PostgreSQL.
3. Restore `/data`.
4. Run migrations.
5. Start web.
6. Start worker.
7. Run health checks.
8. Open one project and test a draft render.

## 10. Docker Hub tags

- `gh-<short-sha>`
- `v0.1.0`
- `latest`

The compose file should permit:

```env
APP_IMAGE=yourname/hansys-video-studio
APP_VERSION=v0.1.0
```

## 11. CI image gates

Before publish:

- lint.
- typecheck.
- unit tests.
- API integration tests.
- short video smoke render.
- container health test.
- compose configuration validation.

## 12. Windows notes

- Store active data in Docker named volumes rather than Windows bind mounts for better file behavior.
- Downloads are served through the browser.
- Provide an optional export directory bind mount only after core reliability is proven.
