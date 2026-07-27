# 11 — Codex Bootstrap Prompt

You are building `hansys-video-studio`.

## Mandatory reading

Before modifying files, read in order:

1. `README.md`
2. `docs/01_PRODUCT_SPEC.md`
3. `docs/02_TECHNICAL_ARCHITECTURE.md`
4. `docs/03_PROJECT_DOCUMENT_SCHEMA.md`
5. `docs/04_DATABASE_SCHEMA.md`
6. `docs/05_API_CONTRACT.md`
7. `docs/06_RENDER_PIPELINE.md`
8. `docs/07_TEMPLATE_SDK.md`
9. `docs/08_DOCKER_DEPLOYMENT.md`
10. `docs/09_TEST_STRATEGY.md`
11. `docs/10_TASKS_BY_COMMIT.md`
12. Machine-readable files under `schemas/`.

## Architecture constraints

- Local-first Docker Compose application.
- No AI script generation.
- Scene-based editor.
- Next.js web/API.
- Separate Node render worker.
- PostgreSQL and Prisma.
- PostgreSQL-backed render queue.
- Local `/data` storage.
- Remotion Player for preview.
- Remotion renderer only in worker.
- Immutable ProjectRevision for every render.
- Static trusted template registry.
- No remote render-time assets.
- No Redis.
- No authentication in MVP.
- No freeform canvas in MVP.
- No user-uploaded template code.
- Do not call `bundle()` for every video.
- All `remotion` and `@remotion/*` packages use exact version `4.0.499`.
- Do not use caret or tilde ranges for Remotion packages.

## Work protocol

Perform exactly one commit from `docs/10_TASKS_BY_COMMIT.md`.

For the selected commit:

1. State the commit number and message.
2. Inspect the current repository.
3. Explain the minimal implementation scope.
4. Implement only that scope.
5. Add or update tests.
6. Run the required checks.
7. Fix all failures caused by the commit.
8. Update documentation, OpenAPI, Prisma or environment examples when affected.
9. Review the diff for unrelated changes.
10. Create exactly one commit with the specified message.
11. Stop.

## Required report after the commit

- Commit hash.
- Files changed.
- What was implemented.
- Commands run.
- Test results.
- Risks or known limitations.
- Next commit number and message.

## Prohibitions

Do not:

- Combine multiple planned commits.
- Skip tests because the implementation seems small.
- claim success with core behavior mocked.
- add cloud services.
- add Redis or BullMQ.
- add login.
- introduce NestJS.
- change PostgreSQL to SQLite.
- change local storage to S3.
- execute Remotion rendering in an HTTP handler.
- store absolute file paths in ProjectDocument.
- fetch fonts or media from the internet during rendering.
- commit `.env`, secrets or large output videos.
- upgrade dependencies outside the selected commit.
- remove old template versions used by revisions.
- modify architecture without adding and explaining an ADR.

## Starting instruction

Start with Commit 01 from `docs/10_TASKS_BY_COMMIT.md`.
