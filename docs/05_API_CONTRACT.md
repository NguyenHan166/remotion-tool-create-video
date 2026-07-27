# 05 — HTTP API Contract

## 1. Conventions

- Base path: `/api/v1`
- JSON: UTF-8.
- Date/time: RFC 3339 UTC.
- IDs: UUID.
- Pagination: page and pageSize.
- Uploads: multipart/form-data.
- Media delivery: Range requests supported.
- No authentication in MVP.
- All request bodies are validated.
- OpenAPI source: `schemas/openapi.yaml`.

## 2. Standard success envelope

Collections:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

Single objects are returned directly.

## 3. Standard error envelope

```json
{
  "error": {
    "code": "PROJECT_VALIDATION_FAILED",
    "message": "Project document is invalid.",
    "details": [
      {
        "path": "scenes.1.durationInFrames",
        "message": "Must be at least 6."
      }
    ],
    "requestId": "01J..."
  }
}
```

## 4. Error codes

- `BAD_REQUEST`
- `PROJECT_NOT_FOUND`
- `PROJECT_VERSION_CONFLICT`
- `PROJECT_VALIDATION_FAILED`
- `TEMPLATE_NOT_FOUND`
- `TEMPLATE_VERSION_MISMATCH`
- `ASSET_NOT_FOUND`
- `ASSET_NOT_READY`
- `ASSET_IN_USE`
- `UNSUPPORTED_MEDIA_TYPE`
- `UPLOAD_TOO_LARGE`
- `CAPTION_PARSE_FAILED`
- `RENDER_NOT_FOUND`
- `RENDER_ALREADY_ACTIVE`
- `RENDER_INVALID_STATE`
- `RENDER_CANNOT_CANCEL`
- `RENDER_FAILED`
- `WORKER_UNAVAILABLE`
- `STORAGE_FULL`
- `INTERNAL_ERROR`

## 5. Health

### GET `/health`

Checks:

- Application version.
- Database connectivity.
- Data directory writable.
- Latest worker heartbeat.
- FFmpeg/Chromium status as reported by worker.

Response status:

- `200` when core web dependencies are healthy.
- `503` when database or writable storage is unavailable.

## 6. Templates

### GET `/templates`

Returns static registry metadata.

### GET `/templates/{templateId}`

Returns manifest excluding executable component references.

### GET `/templates/{templateId}/thumbnail`

Returns built-in thumbnail.

## 7. Projects

### POST `/projects`

Request:

```json
{
  "name": "Tin cảnh báo ngày 27-07",
  "templateId": "warning-dark-v1",
  "width": 1080,
  "height": 1920,
  "fps": 30
}
```

Creates a default draft document.

### GET `/projects`

Query:

- `page`
- `pageSize`
- `search`
- `status`

### GET `/projects/{projectId}`

Returns:

```json
{
  "id": "...",
  "name": "...",
  "status": "DRAFT",
  "draftVersion": 12,
  "document": {},
  "createdAt": "...",
  "updatedAt": "..."
}
```

### PATCH `/projects/{projectId}`

Request:

```json
{
  "expectedDraftVersion": 12,
  "name": "Optional new name",
  "document": {}
}
```

Returns the new canonical version.

Conflict:

- `409 PROJECT_VERSION_CONFLICT`.

### DELETE `/projects/{projectId}`

Archives project.

### POST `/projects/{projectId}/duplicate`

Creates a new project with copied draft document and ProjectAsset references.

### POST `/projects/{projectId}/script-preview`

Returns deterministic scene drafts. Does not persist.

Request:

```json
{
  "rawText": "Đoạn một\n\nĐoạn hai",
  "splitMode": "blank-line",
  "defaultSceneType": "content",
  "defaultDurationInFrames": 150
}
```

`splitMode` is `blank-line`, `delimiter` or `single`. A non-blank `delimiter` is required
for delimiter mode.

### POST `/projects/{projectId}/script-apply`

Applies a previously reviewed set of scene drafts using optimistic concurrency.

Request:

```json
{
  "expectedDraftVersion": 12,
  "scenes": [
    {
      "name": "Scene 1",
      "body": "Nội dung đã duyệt",
      "type": "content",
      "durationInFrames": 150
    }
  ]
}
```

Applying replaces the current scene list, assigns new scene IDs and returns the updated project.

### POST `/projects/{projectId}/revisions`

Creates a manual immutable revision.

### GET `/projects/{projectId}/revisions`

Lists revisions newest first.

## 8. Assets

### POST `/assets`

Multipart fields:

- `file`
- `projectId` optional

The request returns only after storage and metadata extraction for MVP. Status is normally READY; failures produce an error and diagnostic Asset row where possible.

### GET `/assets`

Query:

- `page`
- `pageSize`
- `projectId`
- `kind`
- `search`
- `status`

### GET `/assets/{assetId}`

Returns metadata.

### GET `/assets/{assetId}/file`

Streams the media with Range support.

Headers:

- `Accept-Ranges: bytes`
- `Content-Type`
- `Content-Length`
- `Content-Range` for partial responses

### DELETE `/assets/{assetId}`

Returns `409 ASSET_IN_USE` when referenced.

## 9. Captions

Captions are part of ProjectDocument, but import is a convenience endpoint.

### POST `/projects/{projectId}/captions/import-srt`

Multipart fields:

- `file`
- `expectedDraftVersion`

Parses SRT and updates draft captions.

### PUT `/projects/{projectId}/captions`

Updates only caption configuration using optimistic concurrency.

## 10. Render jobs

### POST `/renders`

Request:

```json
{
  "projectId": "...",
  "preset": "vertical-h264"
}
```

Behavior:

- Validates project.
- Creates immutable revision.
- Creates QUEUED job.

### GET `/renders`

Query:

- `page`
- `pageSize`
- `projectId`
- `status`

### GET `/renders/{renderId}`

Returns status, progress and outputs.

### POST `/renders/{renderId}/cancel`

Valid only for active or queued states.

### POST `/renders/{renderId}/retry`

Valid only for FAILED or CANCELLED.

Retry creates a new attempt on the same job or resets the job according to implementation; the API must keep the same documented behavior once chosen. This specification chooses to reset the existing job and increment attempt when claimed.

### GET `/renders/{renderId}/download`

Returns the VIDEO output.

### GET `/renders/{renderId}/thumbnail`

Returns THUMBNAIL output.

### DELETE `/renders/{renderId}/output`

Deletes physical outputs while keeping job history.

## 11. Settings

### GET `/settings`

Returns safe user-editable settings.

### PATCH `/settings`

MVP-editable keys:

- `render.defaultPreset`
- `render.frameConcurrency`
- `editor.autoSaveDelayMs`
- `storage.retentionDays`

Environment-only settings cannot be changed through API.

## 12. Idempotency

MVP does not require a general idempotency key.

Render creation should accept optional `Idempotency-Key`. When present, store a short-lived request record or use a deterministic uniqueness mechanism to avoid accidental duplicate jobs.

This may be implemented after the core render flow.

## 13. API acceptance rules

- Every endpoint has integration tests.
- Every mutation emits a request ID in logs.
- No endpoint returns absolute local paths.
- No API handler calls Remotion renderer.
- Download file names are sanitized.
- Project validation errors preserve field paths.
