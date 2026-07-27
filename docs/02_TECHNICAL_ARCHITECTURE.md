# 02 — Technical Architecture

## 1. Architecture summary

```text
┌───────────────────────────────────────────────────────┐
│ Browser                                               │
│ Next.js UI + Remotion Player                          │
└───────────────────────┬───────────────────────────────┘
                        │ HTTP / Range requests
┌───────────────────────▼───────────────────────────────┐
│ apps/web                                              │
│ Next.js App Router                                    │
│ API handlers + services                              │
│ Project, asset, revision and render orchestration     │
└──────────────┬───────────────────────────┬────────────┘
               │                           │
               │ PostgreSQL                │ Shared /data volume
               │                           │
┌──────────────▼─────────────┐   ┌────────▼───────────────────┐
│ PostgreSQL                 │   │ Local file storage          │
│ drafts, revisions, assets  │   │ assets, renders, temp,      │
│ render queue, settings     │   │ thumbnails, bundles, logs   │
└──────────────┬─────────────┘   └────────▲───────────────────┘
               │                           │
┌──────────────▼───────────────────────────┴───────────────────┐
│ apps/worker                                                │
│ Claim queue → resolve revision → get bundle → renderMedia   │
│ progress → thumbnail → finalize output                     │
└─────────────────────────────────────────────────────────────┘
```

## 2. Technology stack

### Runtime and repository

- Node.js 22 LTS line.
- pnpm workspace.
- Turborepo.
- TypeScript strict.
- Docker Compose.

### Web application

- Next.js App Router.
- React.
- Tailwind CSS.
- shadcn/ui or local accessible primitives.
- TanStack Query for server state.
- Zustand for transient editor state.
- React Hook Form.
- Zod.
- `@remotion/player`.

### Video package

- `remotion` exact version `4.0.499`.
- `@remotion/player` exact version `4.0.499`.
- `@remotion/renderer` exact version `4.0.499`.
- `@remotion/bundler` exact version `4.0.499`.
- `@remotion/captions` exact version `4.0.499`.
- `@remotion/media-utils` only when a concrete use is implemented.
- `@remotion/transitions` only when template transition implementation begins.

Do not install packages speculatively.

### Data

- PostgreSQL 16.
- Prisma ORM.
- JSONB for versioned project documents.
- SQL row locking for the render queue.

### Media

- FFmpeg and ffprobe.
- Local shared Docker volume.
- Browser-compatible streaming with HTTP Range.

### Tests

- Vitest.
- Playwright.
- React Testing Library where useful.
- Render frame smoke tests.

## 3. Monorepo layout

```text
hansys-video-studio/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── api/v1/
│   │   │   ├── projects/
│   │   │   ├── renders/
│   │   │   └── settings/
│   │   ├── components/
│   │   ├── features/
│   │   └── lib/
│   └── worker/
│       └── src/
│           ├── main.ts
│           ├── queue/
│           ├── render/
│           ├── bundle/
│           ├── heartbeat/
│           └── cleanup/
├── packages/
│   ├── database/
│   ├── project-schema/
│   ├── video/
│   ├── template-registry/
│   ├── storage/
│   ├── shared/
│   └── ui/
├── docs/
├── docker/
├── scripts/
├── compose.yaml
├── pnpm-workspace.yaml
└── turbo.json
```

## 4. Package responsibilities

### `packages/project-schema`

Single source of truth for:

- ProjectDocument TypeScript types.
- Zod schemas.
- JSON migrations.
- Defaults.
- Duration calculation.
- Asset ID extraction.
- Validation error mapping.
- Script split helpers.

It must not depend on Next.js, Prisma or browser-only APIs.

### `packages/video`

Contains:

- Remotion `registerRoot()`.
- Root composition.
- `ProjectVideo`.
- `calculateMetadata`.
- Shared video components.
- Caption components.
- Audio layers.
- Template implementations.
- Fixture projects.

It may depend on `project-schema` and `template-registry`.

It must not query the database.

### `packages/template-registry`

Contains:

- Template manifest types.
- Static registry.
- Template validation.
- Template version lookup.
- Supported scene type lookup.
- Default template project data.

No user-controlled dynamic imports.

### `packages/storage`

Contains:

- Safe path joining.
- Directory initialization.
- Atomic move.
- SHA-256.
- MIME sniffing adapters.
- File streaming.
- Temporary file cleanup.
- Asset and output path conventions.

### `packages/database`

Contains:

- Prisma client.
- Transaction helpers.
- Queue claim SQL.
- Repository implementations.
- Migrations.

### `apps/web`

Contains:

- UI.
- API transport.
- Use-case orchestration.
- Autosave.
- Upload handling.
- Render enqueue.
- Download responses.

The web process must never call `renderMedia()`.

### `apps/worker`

Contains:

- Job polling.
- Job claiming.
- Heartbeat.
- Bundle cache.
- `selectComposition()`.
- `renderMedia()`.
- `renderStill()`.
- Cancellation.
- Recovery.
- Cleanup scheduling.

## 5. Data ownership

| Data | Source of truth |
|---|---|
| Current editable project | `Project.draftDocument` |
| Immutable historical input | `ProjectRevision.document` |
| Template implementation | source code |
| Template identity | manifest ID + version |
| Media binary | `/data/assets` |
| Media metadata | `Asset` |
| Queue state | `RenderJob` |
| Final output | `/data/renders` + `RenderOutput` |
| Application configuration | environment + `AppSetting` |
| Worker liveness | `WorkerHeartbeat` |

## 6. Key data flows

### 6.1 Autosave

```text
Editor state changes
→ 800 ms debounce
→ PATCH project with expected draftVersion
→ validate ProjectDocument
→ transaction update where draftVersion matches
→ increment draftVersion
→ return canonical draft
```

Use optimistic concurrency. A stale browser receives `409 PROJECT_VERSION_CONFLICT`.

### 6.2 Render creation

```text
POST /renders
→ read project draft
→ validate template and assets
→ create immutable revision
→ create RevisionAsset rows
→ create QUEUED render job
→ return job
```

Revision and job creation occur in one transaction.

### 6.3 Render execution

```text
Worker claims one QUEUED job
→ marks PREPARING
→ reads revision and assets
→ obtains cached bundle
→ selectComposition with inputProps
→ renderMedia with same inputProps
→ progress updates
→ renderStill
→ atomic output finalization
→ COMPLETED
```

### 6.4 Asset playback

```text
Player receives logical asset URL
→ GET /api/v1/assets/:id/file
→ authorization is local-only in MVP
→ validate READY state
→ stream with Range support
```

The ProjectDocument stores asset IDs, not file system paths.

## 7. Architectural decisions

### ADR-001 Scene-based editor

MVP uses sequential scenes. This gives predictable duration and avoids building an NLE timeline.

### ADR-002 Project JSON + template code

Structured data is editable and migratable. Template code remains trusted and version-controlled.

### ADR-003 PostgreSQL queue

The product already needs PostgreSQL for projects and revisions. A database queue avoids Redis in the local MVP.

### ADR-004 Separate render worker

Rendering is CPU and memory intensive and must not block HTTP requests.

### ADR-005 Shared image for web and worker

Web and worker should be built from the same source and dependency lockfile so preview and render do not drift.

### ADR-006 Immutable render revisions

A render must remain reproducible even while the draft continues changing.

### ADR-007 Cache bundle

Bundle only changes when composition source or dependencies change. Input props vary per project.

### ADR-008 No remote assets

Local-only assets reduce rendering failures, improve privacy and preserve deterministic output.

## 8. Concurrency model

### Web concurrency

Normal HTTP concurrency. Draft updates use optimistic version checks.

### Queue concurrency

Worker claims with:

```sql
SELECT id
FROM "RenderJob"
WHERE status = 'QUEUED'
  AND "availableAt" <= NOW()
ORDER BY priority DESC, "createdAt" ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

Then updates the row in the same transaction.

### Render concurrency

- MVP worker job concurrency: `1`.
- Remotion frame concurrency: configurable through `RENDER_FRAME_CONCURRENCY`.
- Do not launch multiple full 1080 × 1920 renders by default.

## 9. Security boundaries

Even though the system is local:

- Reject path traversal.
- Do not execute uploaded content.
- Do not load user-provided JSX.
- Validate MIME and extension.
- Use maximum upload size.
- Use UUID storage names.
- Do not expose absolute paths.
- Avoid shell command construction from user input.
- Invoke ffprobe through argument arrays.
- Store secrets only in environment variables.
- Sanitize download file names.
- Set a restrictive Content Security Policy where compatible with Player.

## 10. Versioning policy

### Project schema

- Integer `schemaVersion`.
- Migration functions are sequential: `v1 → v2`.
- Old revisions are not rewritten in place.

### Template

- Template has stable ID and integer version.
- Breaking visual or contract change creates a new version.
- Render revision stores both.

### Application

- Semantic version.
- Docker image tags:
  - immutable Git SHA
  - release version
  - `latest` for convenience only

### Remotion

- Exact versions.
- Upgrade all Remotion packages together.
- Upgrade in a dedicated commit with smoke render.
