# 09 — Test Strategy

## 1. Test pyramid

### Unit

Fast and deterministic:

- Project Zod schema.
- Migrations.
- Duration and scene ranges.
- Script splitting.
- Asset ID extraction.
- Caption parsing/grouping.
- Template validation.
- Bundle key.
- Render state transitions.
- Retry classification.
- Safe path resolver.

### Integration

With PostgreSQL and temporary storage:

- Project create/update conflict.
- ProjectAsset synchronization.
- Revision creation.
- RevisionAsset freezing.
- Asset upload metadata.
- Range response.
- Queue claim.
- Cancellation state.
- Output deletion rules.

### Video smoke

With Remotion renderer:

- Select composition.
- Render still frames.
- Short low-resolution MP4.
- Long Vietnamese text fixture.
- Caption fixture.
- Audio fixture.
- Missing asset failure.

### End-to-end

Browser workflow:

```text
create project
→ paste script
→ apply scenes
→ upload image
→ edit headline
→ verify Player
→ save
→ render draft
→ wait for completed
→ download
```

## 2. Required scripts

```json
{
  "scripts": {
    "lint": "...",
    "typecheck": "...",
    "test": "vitest run",
    "test:integration": "...",
    "test:video": "...",
    "test:e2e": "playwright test",
    "test:all": "..."
  }
}
```

## 3. Fixture policy

Fixtures must be small and committed only when licensing permits.

Required fixtures:

- Tiny image.
- Tiny silent video.
- Tiny audio.
- SRT.
- Project JSON for each template.
- Long Vietnamese text.

Do not commit large rendered MP4 files.

## 4. Video smoke dimensions

CI:

- 360 × 640.
- 30 FPS.
- 2–3 seconds.
- H.264 draft quality.

Release verification:

- 1080 × 1920.
- Representative 15-second project.
- Captions and audio.
- At least one video asset.

## 5. Visual regression

MVP minimum:

- Render selected PNG frames.
- Store approved snapshots or perceptual hashes.
- Allow small encoding-independent pixel tolerance.
- Review changes intentionally when templates change.

## 6. Failure tests

Required:

- Invalid project schema.
- Unsupported scene.
- Missing physical asset.
- Corrupt media.
- Database unavailable.
- Storage read-only.
- Bundle failure.
- Browser crash simulation where feasible.
- Cancel queued job.
- Cancel running job.
- Worker restart and stale recovery.
- Project version conflict.
- Asset in use.

## 7. Definition of done per commit

At minimum:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Additional:

- Web behavior: relevant integration/E2E.
- Video code: `pnpm test:video`.
- Database: migrations from clean database and existing previous migration.
- Docker: `docker compose config` and image smoke.

## 8. Release checklist

- Clean install.
- Migration.
- Health green.
- Core E2E.
- 1080 × 1920 render.
- Cancel and retry.
- Restart persistence.
- Backup.
- Restore.
- Upgrade from previous tag.
