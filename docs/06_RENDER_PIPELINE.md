# 06 — Render Pipeline

## 1. Principles

- Rendering happens only in `apps/worker`.
- A job always uses an immutable ProjectRevision.
- The exact same input props are passed to `selectComposition()` and `renderMedia()`.
- Bundle is reused until source code or dependencies change.
- Media is local and referenced through controlled URLs or a worker-local asset server.
- Output is finalized atomically.

## 2. Bundle strategy

Bundle key components:

```text
sha256(
  packages/video source tree
  + packages/project-schema source tree
  + packages/template-registry source tree
  + pnpm-lock.yaml
  + exact Remotion version
  + remotion config
  + build mode
)
```

Location:

```text
/data/bundles/<bundle-key>/
```

Bundle lock:

- Use a lock file or PostgreSQL advisory lock.
- Only one worker builds a missing key.
- Other workers wait and then reuse it.
- Write into a temporary directory.
- Rename into final directory after success.

Do not call `bundle()` per project or per job.

## 3. Worker lifecycle

```text
start
→ validate environment
→ ensure directories
→ ensure FFmpeg/ffprobe/browser
→ recover stale jobs
→ publish heartbeat
→ poll queue
→ claim job
→ execute
→ repeat
```

Graceful shutdown:

- Stop claiming.
- Request cancellation for current render only when shutdown timeout requires it.
- Update heartbeat status.
- Exit after cleanup.

## 4. Execution stages

### PREPARING

- Load RenderJob.
- Load ProjectRevision.
- Parse and migrate ProjectDocument in memory.
- Validate template.
- Load RevisionAsset records.
- Verify physical files.
- Create job temp directory.
- Build worker input props.

### BUNDLING

- Calculate bundle key.
- Reuse cache or build missing bundle.
- Update stage progress separately from render progress.

### RENDERING

- Call `selectComposition()`.
- Pass `serveUrl`, composition ID and input props.
- Verify returned width, height, FPS and duration.
- Call `renderMedia()`.
- Codec: H.264.
- Output: temporary `.mp4.part` or temporary directory.
- Throttle database progress updates.

### ENCODING

Remotion progress may indicate encoding/muxing. Map it to job status while preserving overall progress.

### FINALIZATION

- Verify output exists and size > 0.
- Probe final media.
- Move output atomically.
- Call `renderStill()` for thumbnail.
- Create RenderOutput rows.
- Mark COMPLETED.

## 5. Worker input props

```ts
type VideoProps = {
  project: ProjectDocumentV1;
  assets: Record<
    string,
    {
      id: string;
      kind: "IMAGE" | "VIDEO" | "AUDIO" | "LOGO";
      src: string;
      width?: number;
      height?: number;
      durationMs?: number;
    }
  >;
};
```

`src` is resolved by the worker, not stored in the revision document.

## 6. Asset serving options

Preferred MVP:

- Worker starts a loopback-only static asset server bound to `127.0.0.1`.
- URLs are random-token scoped to the active job.
- Server supports Range requests.
- Server can map only approved RevisionAsset IDs.

Alternative:

- Use file URLs only if Remotion and browser behavior is tested across Docker and Windows volume mounts.

Do not expose arbitrary local paths.

## 7. Progress model

Database fields:

- `status`
- `progress`
- `renderedFrames`
- `encodedFrames`
- `totalFrames`
- `heartbeatAt`
- `stageMessage`

Rules:

- `progress` is 0–1.
- Write at most every 500 ms or when status changes.
- Always write final 1.0 before COMPLETED.
- UI polls every 1 second in MVP.
- SSE may replace polling later.

Suggested weighting:

- PREPARING: 0–0.03
- BUNDLING: 0.03–0.10
- RENDERING/ENCODING: 0.10–0.97
- THUMBNAIL/FINALIZE: 0.97–1.00

## 8. Cancellation

When API sets `CANCEL_REQUESTED`:

- Worker cancellation checker sees it.
- Invoke Remotion cancel signal.
- Stop progress writes except final status.
- Remove temporary output.
- Mark CANCELLED.
- Keep revision.

Cancellation polling must not query database on every frame. Poll around once per second.

## 9. Retry policy

Default:

- `maxAttempts = 2`.
- Automatic retry only for infrastructure-like failures:
  - browser crash
  - worker interruption
  - transient file lock
- No automatic retry for:
  - invalid project
  - missing template
  - missing asset
  - unsupported codec
  - deterministic composition error

Manual retry is permitted after the user fixes the project only if a new revision is created. Therefore:

- Retry existing job is for transient failure only.
- To render changed content, create a new render job.

## 10. Error taxonomy

- `PROJECT_SCHEMA_INVALID`
- `TEMPLATE_NOT_FOUND`
- `TEMPLATE_VALIDATION_FAILED`
- `ASSET_METADATA_MISSING`
- `ASSET_FILE_MISSING`
- `BUNDLE_FAILED`
- `COMPOSITION_SELECT_FAILED`
- `BROWSER_CRASHED`
- `RENDER_TIMEOUT`
- `RENDER_CANCELLED`
- `FFMPEG_FAILED`
- `OUTPUT_PROBE_FAILED`
- `STORAGE_FULL`
- `WORKER_LOST`
- `UNKNOWN_RENDER_ERROR`

Store:

- Safe error message.
- Technical message.
- Short stack trace.
- Browser log excerpt.
- Diagnostic log output path.

Render diagnostics are persisted as redacted JSONL `RenderOutput(LOG)` files under
`logs/<renderJobId>/attempt-<n>.jsonl`. The worker includes request/job/worker context,
stage transitions, Remotion browser logs and the classified failure. Absolute local
paths and sensitive values are replaced before the file is written. The web API
streams a failed job's diagnostic through `GET /api/v1/renders/:renderId/diagnostic`
with a relative `Content-Disposition` filename; it never exposes the configured data
directory.

## 11. Storage retention

The worker runs a retention pass on a configurable interval. It removes files older
than `STORAGE_RETENTION_DAYS` from temporary attempts, diagnostics, bundle cache and
render outputs while preserving active temporary job directories. Asset files are
owned by the asset repository and are intentionally excluded from the scan. The
same service is available through `pnpm cleanup -- --dry-run` and requires
`--execute` before it mutates storage.

## 12. Pseudocode

```ts
async function executeJob(jobId: string, workerId: string) {
  const cancel = makeCancelSignal();

  try {
    const context = await prepareJob(jobId, workerId);
    const serveUrl = await bundleCache.getOrCreate(context.bundleKey);

    const composition = await selectComposition({
      serveUrl,
      id: "ProjectVideo",
      inputProps: context.inputProps,
    });

    await renderMedia({
      serveUrl,
      composition,
      inputProps: context.inputProps,
      codec: "h264",
      outputLocation: context.tempVideoPath,
      cancelSignal: cancel.cancelSignal,
      concurrency: context.frameConcurrency,
      onProgress: throttle((data) => reportProgress(jobId, data), 500),
      onBrowserLog: (log) => context.diagnostics.capture(log),
    });

    await finalizeVideo(context);
    await renderThumbnail(context, serveUrl, composition);
    await markCompleted(jobId);
  } catch (error) {
    await classifyAndPersistFailure(jobId, error);
  } finally {
    await cleanupAttempt(jobId);
  }
}
```

Codex must confirm the exact cancellation option name against the pinned Remotion type definitions.

## 13. Bundle invalidation test

The test must prove:

1. Two different project props reuse one bundle.
2. Editing a template source file changes the bundle key.
3. Changing `pnpm-lock.yaml` changes the bundle key.
4. A failed build does not become the final cache directory.

## 14. Render smoke fixtures

Every template includes:

- Minimal text project.
- Long Vietnamese text project.
- Image project.
- Video project when supported.
- Caption and audio project.

Smoke frames:

- frame 0
- first scene midpoint
- scene boundary
- final frame
