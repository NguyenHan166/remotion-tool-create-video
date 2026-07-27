# 01 — Product & Technical Specification

## 1. Product identity

- Working name: **HanSYS Video Studio**
- Product type: Personal video creation and rendering tool
- Primary deployment: Local Docker Compose
- Primary device: Windows 11 with Docker Desktop
- UI language: Vietnamese
- Primary format: Vertical short-form video
- Default composition: 1080 × 1920, 30 FPS
- Typical duration: 10–180 seconds
- Primary output: MP4, H.264, AAC

## 2. Problem statement

The user can prepare a script but wants to avoid manually rebuilding the same visual structure in CapCut for every video. The system should transform structured scene data and local media into a repeatable Remotion template, while still allowing manual control over text, duration, assets and audio.

## 3. Core workflow

```text
External script
  ↓
Create project
  ↓
Paste text / split into scenes
  ↓
Choose scene types and template
  ↓
Attach local media
  ↓
Optional voice-over, music and SRT
  ↓
Preview
  ↓
Save immutable revision
  ↓
Queue render
  ↓
Download MP4 and thumbnail
```

## 4. User roles

MVP has one implicit local owner. There is no authentication, team, permission or tenant model.

The architecture must not make multi-user support impossible, but no multi-user code is required in v0.1.

## 5. MVP functional requirements

### FR-001 Project dashboard

The user can:

- Create a project.
- Search projects by name.
- Open a recent project.
- Duplicate a project.
- Archive a project.
- See the newest completed render.
- See worker and storage status.

### FR-002 Project creation

The user chooses:

- Name.
- Template.
- Width and height preset.
- FPS.
- Default background.
- Optional project description.

MVP exposes only vertical 9:16 in the main UI, while the document model permits future aspect ratios.

### FR-003 Script paste

The user can paste plain text into a script import dialog.

Supported deterministic splitting modes:

- Blank line.
- One paragraph per scene.
- Custom delimiter such as `---`.
- No split: one scene.

The tool must not call an LLM or rewrite the text.

The import result is a preview list. The user confirms before scenes are created.

### FR-004 Scene editor

The user can:

- Add a scene.
- Duplicate a scene.
- Delete a scene.
- Reorder scenes.
- Rename a scene.
- Change scene type.
- Edit headline, body, source, label and bullets.
- Change duration.
- Choose a media asset.
- Change fit, position and scale.
- Choose a supported visual variant.

### FR-005 Scene types

MVP scene types:

- `hook`
- `headline`
- `content`
- `image`
- `video`
- `bullet-list`
- `quote`
- `outro`

Templates may reject unsupported scene types.

### FR-006 Preview

Preview uses the same composition component that the worker renders.

Controls:

- Play and pause.
- Seek.
- Previous and next scene.
- Current time and total time.
- Mute.
- Fit preview.
- Fullscreen.
- Display the active scene.

Project changes update preview without creating a rendered MP4.

### FR-007 Asset library

The user can upload and reuse:

- PNG, JPEG, WebP.
- MP4, MOV, WebM when supported by FFmpeg.
- MP3, WAV, M4A, AAC.
- SRT.

The system extracts metadata and blocks invalid or oversized uploads.

### FR-008 Audio

MVP supports:

- One project voice-over track.
- One background music track.
- Volume.
- Start offset.
- Music loop.
- Fade in.
- Fade out.
- Muted export.

Local TTS is not a blocker for v0.1. A provider interface must be reserved for a later Kokoro integration.

### FR-009 Captions

MVP supports:

- Import SRT.
- Manual caption editing.
- Timing editing.
- Enable or disable.
- `clean`, `tiktok`, and `news` styles.
- Caption safe area.
- Optional word highlight when timing data supports it.

### FR-010 Project persistence

- Draft autosaves after a debounce.
- Autosave updates the mutable project draft.
- Autosave does not create permanent revisions.
- A permanent revision is created when rendering begins.
- Manual revision creation is optional but supported.

### FR-011 Rendering

The user can:

- Create a render job.
- See queue state.
- See progress.
- Cancel a running job.
- Retry a failed job.
- Download the video.
- Download or view a thumbnail.
- Delete render output without deleting the project revision.

### FR-012 Persistence across restart

Project data, uploaded media and completed renders must survive:

- Web container restart.
- Worker restart.
- Docker Compose restart.
- Application image upgrade.

## 6. Non-functional requirements

### NFR-001 Determinism

The same project revision, template version, asset files and application image should produce visually equivalent output.

Composition code must not use:

- `Date.now()`
- unseeded `Math.random()`
- network-fetched fonts
- network-fetched media
- timers as animation clocks
- mutable external API data during render

### NFR-002 Reliability

- Render jobs are recoverable after worker restart.
- Each render references an immutable revision.
- Partial output uses a temporary name and is atomically moved after success.
- A failed job preserves diagnostics.
- A stale active job is either retried or failed according to attempt policy.

### NFR-003 Performance

Default targets on a typical desktop:

- Editor interaction should feel immediate for text updates.
- Autosave should not block the preview.
- API list endpoints use pagination.
- Render progress writes are throttled.
- Bundle generation is cached.
- Default worker concurrency is one render job.
- Remotion internal frame concurrency is configurable.

These are design targets, not hard benchmark guarantees.

### NFR-004 Storage safety

- Media file names are UUID-based.
- Relative paths only are stored in database documents.
- Path traversal is rejected.
- Temporary uploads are cleaned.
- Asset deletion checks references.
- Database backup and data volume backup are documented.

### NFR-005 Maintainability

- pnpm workspace.
- TypeScript strict.
- Zod at all HTTP boundaries.
- Business logic outside React views.
- Central project schema package.
- Central template registry.
- Versioned database migrations.
- Versioned ProjectDocument migrations.
- Versioned template manifests.

### NFR-006 Observability

- Structured logs.
- Request ID.
- Render job ID.
- Worker heartbeat.
- Render diagnostics.
- Health endpoint checks database, storage and application version.

## 7. Explicitly out of scope for MVP

- AI script generation.
- AI script rewriting.
- Automatic article URL scraping.
- Automatic image search.
- Cloud rendering.
- Accounts and login.
- Multi-user collaboration.
- Mobile native app.
- Freeform canvas editor.
- Multi-track NLE timeline.
- Keyframe editor.
- Plugin marketplace.
- User-uploaded executable template code.
- Remote URL assets.
- Real-time collaboration.
- Project sync between multiple computers.

## 8. Definition of MVP complete

MVP is complete only when all conditions are met:

1. Fresh Docker Compose installation succeeds.
2. Database migration runs successfully.
3. Project can be created and autosaved.
4. At least one production-quality template exists.
5. Image, video and audio can be uploaded.
6. Scenes can be created and reordered.
7. Preview changes with project data.
8. SRT can be imported.
9. Render job can be queued.
10. Worker can render H.264 MP4.
11. Progress is visible.
12. Cancellation works.
13. Retry works.
14. Completed output can be downloaded.
15. Data survives restart.
16. End-to-end automated test covers the core workflow.
17. Backup and restore runbook has been manually verified.

## 9. Release gates

### Gate A — Skeleton

- Monorepo builds.
- Web, worker and database connect.
- Health endpoint is green.

### Gate B — Editable preview

- Project schema and persistence work.
- One template is shown in Player.
- Scene edits update preview.

### Gate C — Renderable MVP

- Immutable revision.
- PostgreSQL render queue.
- Worker.
- Bundle cache.
- MP4 download.

### Gate D — Content-ready MVP

- Captions.
- Voice-over.
- Background music.
- Three templates.

### Gate E — Distributable v0.1

- Production image.
- Docker Hub publishing.
- Backup/restore.
- E2E and smoke render.
