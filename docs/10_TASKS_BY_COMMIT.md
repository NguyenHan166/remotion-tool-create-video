# 10 — Tasks by Commit

## Execution rules

- Codex performs exactly one commit at a time.
- It reads this file and all referenced specifications before coding.
- It does not change architecture without an ADR.
- Every commit includes tests appropriate to its scope.
- Every commit ends with a clean working tree.
- Required baseline: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Video changes additionally run `pnpm test:video`.
- Docker changes additionally run image and Compose smoke checks.

## Commit plan

## Phase 0 — Foundation

### Commit 01 — `docs: add product scope and architecture decisions`

Scope:
- Add documentation skeleton and ADRs.
- Record local-first, no AI script generation, scene editor, PostgreSQL queue.

Acceptance:
- Docs cross-links work.
- No implementation files changed.

### Commit 02 — `chore: initialize pnpm turborepo monorepo`

Scope:
- Create apps/web, apps/worker and package folders.
- Configure TypeScript strict, ESLint and formatting.

Acceptance:
- pnpm install, lint and typecheck pass.

### Commit 03 — `chore: pin remotion packages to 4.0.499`

Scope:
- Install required Remotion packages at exact same version.
- Add script that fails on version mismatch or caret ranges.

Acceptance:
- Version check test passes.
- Lockfile committed.

### Commit 04 — `feat: validate environment configuration`

Scope:
- Create server and client environment schemas.
- Create .env.example and fail-fast startup validation.

Acceptance:
- Missing required environment returns clear startup error.

### Commit 05 — `feat: add postgres and prisma foundation`

Scope:
- Add database service for development.
- Create Prisma package and initial migration.

Acceptance:
- Clean database migration succeeds.
- Prisma client generation succeeds.

### Commit 06 — `feat: add storage directory bootstrap`

Scope:
- Create safe storage package and directory conventions.
- Add writable storage startup check.

Acceptance:
- Path traversal tests pass.
- Directories initialize idempotently.

### Commit 07 — `feat: add web and worker health reporting`

Scope:
- Add health endpoint and WorkerHeartbeat model.
- Add worker heartbeat loop.

Acceptance:
- Health reports database, storage and worker state.

## Phase 1 — Project model

### Commit 08 — `feat: define versioned project document schema`

Scope:
- Implement TypeScript and Zod schemas.
- Add defaults, validation error mapping and JSON schema generation.

Acceptance:
- Example project validates.
- Invalid fixtures fail with field paths.

### Commit 09 — `feat: add project document migration framework`

Scope:
- Implement sequential in-memory migrations.
- Add unsupported version error.

Acceptance:
- Migration tests cover current and unknown versions.

### Commit 10 — `feat: implement project repository and crud api`

Scope:
- Create, list, read, update and archive.
- Use optimistic draftVersion concurrency.

Acceptance:
- Integration tests cover 409 conflict.

### Commit 11 — `feat: synchronize project asset references`

Scope:
- Extract asset IDs from draft.
- Maintain ProjectAsset rows transactionally.

Acceptance:
- Stale links are removed; missing assets rejected.

### Commit 12 — `feat: add project duplicate and revision endpoints`

Scope:
- Duplicate draft and references.
- Create manual immutable revision.

Acceptance:
- Revision numbering and content hash tests pass.

### Commit 13 — `feat: implement deterministic script splitting`

Scope:
- Blank-line, delimiter and single modes.
- Add preview and apply endpoints.

Acceptance:
- No AI dependencies.
- Vietnamese paragraph tests pass.

## Phase 2 — Asset system

### Commit 14 — `feat: implement asset storage records and safe naming`

Scope:
- Create Asset model and repositories.
- Use UUID storage names and relative paths.

Acceptance:
- No original filename used as disk path.

### Commit 15 — `feat: add multipart media upload validation`

Scope:
- Validate size, extension and detected MIME.
- Write to temp then atomic move.

Acceptance:
- Unsupported and oversized files fail safely.

### Commit 16 — `feat: extract media metadata with ffprobe`

Scope:
- Width, height, duration and audio presence.
- Persist READY or FAILED.

Acceptance:
- Image, video and audio fixture tests pass.

### Commit 17 — `feat: stream asset files with range support`

Scope:
- Implement full and partial responses.
- Set correct media headers.

Acceptance:
- Browser media seeking integration test passes.

### Commit 18 — `feat: add asset library ui`

Scope:
- Upload, list, filter, preview and delete.
- Show in-use conflict.

Acceptance:
- E2E uploads an image and previews it.

## Phase 3 — Remotion preview core

### Commit 19 — `feat: initialize shared remotion root and composition`

Scope:
- Create registerRoot, Root and ProjectVideo.
- Implement calculateMetadata from ProjectDocument.

Acceptance:
- Studio opens fixture; metadata tests pass.

### Commit 20 — `feat: add static template registry contract`

Scope:
- Manifest, lookup and version validation.
- Expose template list API.

Acceptance:
- Unknown template produces typed error.

### Commit 21 — `feat: implement news-clean-v1 template`

Scope:
- Implement supported scenes and shared layers.
- Use local Vietnamese fonts.

Acceptance:
- Start/mid/end frame smoke tests pass.

### Commit 22 — `feat: embed remotion player in project editor`

Scope:
- Use ProjectVideo and live draft input props.
- Add responsive sizing and error state.

Acceptance:
- Text edit changes preview without render.

### Commit 23 — `feat: add scene list operations`

Scope:
- Add, duplicate, delete, select and reorder.
- Keep stable scene IDs.

Acceptance:
- Unit and UI tests cover ordering.

### Commit 24 — `feat: add scene inspector`

Scope:
- Text, media, duration, alignment and variants.
- Validate fields before state update.

Acceptance:
- All MVP scene types editable.

### Commit 25 — `feat: add autosave and version conflict recovery`

Scope:
- Debounced save.
- Show saving/saved/error and handle 409.

Acceptance:
- No save loop; stale tab conflict is visible.

### Commit 26 — `feat: add scene strip and player controls`

Scope:
- Seek by scene, previous/next, time and mute.
- Highlight active scene.

Acceptance:
- Boundary seeking is frame accurate.

## Phase 4 — Render queue and worker

### Commit 27 — `feat: add render job and output database models`

Scope:
- Add migration, repositories and state transition guard.
- Create list/read APIs.

Acceptance:
- Invalid transitions fail tests.

### Commit 28 — `feat: create render revision and enqueue transaction`

Scope:
- Validate draft and assets.
- Create revision, RevisionAsset and QUEUED job atomically.

Acceptance:
- Rollback test leaves no partial revision/job.

### Commit 29 — `feat: implement postgres queue claim`

Scope:
- Use FOR UPDATE SKIP LOCKED.
- Respect priority and availableAt.

Acceptance:
- Concurrent claim test returns one owner per job.

### Commit 30 — `feat: add worker lifecycle and graceful shutdown`

Scope:
- Polling, heartbeat, worker ID, stop claiming.
- Add environment doctor.

Acceptance:
- Worker starts without web process.

### Commit 31 — `feat: implement stale render recovery`

Scope:
- Detect stale heartbeat.
- Retry or fail by attempt policy.

Acceptance:
- Restart simulation passes.

### Commit 32 — `feat: implement persistent remotion bundle cache`

Scope:
- Compute source/dependency key.
- Lock build and atomically finalize cache.

Acceptance:
- Multiple project props reuse same bundle.

### Commit 33 — `feat: select composition from immutable revision`

Scope:
- Resolve assets and build input props.
- Pass same props to selectComposition.

Acceptance:
- Dynamic duration and size match revision.

### Commit 34 — `feat: render h264 media and report progress`

Scope:
- Call renderMedia in worker.
- Throttle progress writes and map stages.

Acceptance:
- Short MP4 smoke render completes.

### Commit 35 — `feat: add render cancellation`

Scope:
- API sets CANCEL_REQUESTED.
- Worker invokes cancel signal and cleans temp.

Acceptance:
- Queued and running cancellation tests pass.

### Commit 36 — `feat: add render retry and failure classification`

Scope:
- Typed errors and transient retry policy.
- Manual retry endpoint.

Acceptance:
- Deterministic failures are not auto-retried.

### Commit 37 — `feat: generate thumbnail and finalize outputs`

Scope:
- Render still, probe output, atomic move and RenderOutput rows.

Acceptance:
- Video and thumbnail download correctly.

### Commit 38 — `feat: add render queue and progress ui`

Scope:
- List, polling, progress, cancel, retry and download.
- Show safe diagnostics.

Acceptance:
- Core E2E reaches completed output.

## Phase 5 — Captions and audio

### Commit 39 — `feat: parse and import srt captions`

Scope:
- SRT parser, validation and optimistic draft update.
- Caption editor list.

Acceptance:
- Vietnamese SRT fixture imports.

### Commit 40 — `feat: add caption rendering layers`

Scope:
- Clean, TikTok and news styles.
- Safe area and page grouping.

Acceptance:
- Caption frame snapshots pass.

### Commit 41 — `feat: add voiceover track`

Scope:
- Asset selection, volume, start offset.
- Preview and render share implementation.

Acceptance:
- Audio exists in rendered output.

### Commit 42 — `feat: add background music controls`

Scope:
- Volume, loop, fade and offset.
- Prevent invalid fade lengths.

Acceptance:
- Audio mix smoke test passes.

### Commit 43 — `refactor: add tts provider interface without implementation`

Scope:
- Define provider contracts and disabled settings UI boundary.
- No TTS package installed.

Acceptance:
- No behavior change; architecture ready for later Kokoro.

## Phase 6 — Template pack

### Commit 44 — `feat: implement breaking-red-v1 template`

Scope:
- Breaking scenes, high contrast and variants.
- Fixture and snapshots.

Acceptance:
- Long Vietnamese headline remains legible.

### Commit 45 — `feat: implement warning-dark-v1 template`

Scope:
- Warning and bullet scenes.
- Fixture and snapshots.

Acceptance:
- Caption safe area remains clear.

### Commit 46 — `feat: add theme logo watermark and source controls`

Scope:
- Shared theme inspector.
- Template support validation.

Acceptance:
- All templates render theme fixture.

### Commit 47 — `test: add visual regression suite for templates`

Scope:
- Approved frames and perceptual comparison.
- Document snapshot update process.

Acceptance:
- Intentional visual changes require snapshot update.

## Phase 7 — Production and release

### Commit 48 — `feat: add structured logs and render diagnostics`

Scope:
- Request IDs, worker/job context and browser logs.
- Redact sensitive values.

Acceptance:
- Diagnostic download contains no absolute public path.

### Commit 49 — `feat: add cleanup and retention service`

Scope:
- Temp, logs, bundles and deleted outputs.
- Dry-run command.

Acceptance:
- Referenced assets are never deleted.

### Commit 50 — `test: add api integration suite`

Scope:
- Projects, assets, captions and renders.
- Failure states.

Acceptance:
- Suite runs against ephemeral PostgreSQL.

### Commit 51 — `test: add full end-to-end render workflow`

Scope:
- Create, script import, upload, preview, render and download.
- Use draft resolution in CI.

Acceptance:
- Runs reliably from clean state.

### Commit 52 — `build: add production multi-stage docker image`

Scope:
- Node, FFmpeg, browser dependencies and fonts.
- Non-root where compatible.

Acceptance:
- Container performs smoke render.

### Commit 53 — `build: add production docker compose stack`

Scope:
- Web, worker, db, migrate and named volumes.
- Healthchecks and restart policy.

Acceptance:
- Fresh compose install is green.

### Commit 54 — `ci: publish versioned docker hub images`

Scope:
- Buildx cache, SHA and release tags.
- Run gates before push.

Acceptance:
- Failed smoke render blocks publishing.

### Commit 55 — `docs: add install backup restore update and rollback runbooks`

Scope:
- Windows Docker Desktop instructions.
- Verified backup and restore steps.

Acceptance:
- A clean-machine rehearsal is recorded.

### Commit 56 — `release: prepare v0.1.0`

Scope:
- Changelog, known limitations and release tag.
- Full release checklist.

Acceptance:
- 1080x1920 representative render passes.

## Codex stop condition

After each commit, Codex must stop and report:

- Commit hash and message.
- Files changed.
- Tests executed and results.
- Remaining risk or limitation.
- Exact next commit.

Codex must not silently proceed to the next commit.

## Critical milestone

The first usable technical MVP is reached after the commit that adds the render queue and progress UI. At that point the following flow must work before captions, extra templates or visual polish continue:

```text
Create project → edit scene → preview → render → download MP4
```
