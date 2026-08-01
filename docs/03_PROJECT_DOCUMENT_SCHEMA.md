# 03 — ProjectDocument Schema

## 1. Purpose

`ProjectDocument` is the editable and renderable representation of a video project.

Requirements:

- JSON serializable.
- Versioned.
- No absolute file paths.
- No executable code.
- No database-specific objects.
- Same object is used as Remotion input props.
- Every render stores an immutable copy.

## 2. TypeScript contract

```ts
export type ProjectDocumentV1 = {
  schemaVersion: 1;
  metadata: {
    title: string;
    description?: string;
  };
  composition: {
    width: number;
    height: number;
    fps: number;
    backgroundColor: string;
  };
  template: {
    id: string;
    version: number;
  };
  theme: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    textColor: string;
    mutedTextColor: string;
    fontFamily: "BeVietnamPro" | "Inter" | "NotoSans";
    logoAssetId?: string;
    watermarkText?: string;
    sourceText?: string;
  };
  scenes: SceneV1[];
  audio: {
    voiceover?: AudioTrackV1;
    backgroundMusic?: BackgroundMusicTrackV1;
  };
  captions: CaptionConfigV1;
  export: ExportConfigV1;
};

export type SceneV1 = {
  id: string;
  type:
    | "hook"
    | "headline"
    | "content"
    | "image"
    | "video"
    | "bullet-list"
    | "quote"
    | "outro";
  name: string;
  enabled: boolean;
  durationInFrames: number;
  transition?: {
    type: "none" | "fade" | "slide-left" | "slide-up";
    durationInFrames: number;
  };
  text: {
    label?: string;
    headline?: string;
    body?: string;
    source?: string;
    quoteAuthor?: string;
    bullets?: string[];
  };
  media?: {
    assetId: string;
    fit: "cover" | "contain";
    positionX: number;
    positionY: number;
    scale: number;
    startFromMs: number;
    playbackRate: number;
    muted: boolean;
  };
  style: {
    variant?: string;
    textAlign: "left" | "center" | "right";
    emphasis: "normal" | "strong" | "urgent";
  };
};

export type AudioTrackV1 = {
  assetId: string;
  volume: number;
  startAtFrame: number;
};

export type BackgroundMusicTrackV1 = AudioTrackV1 & {
  loop: boolean;
  fadeInFrames: number;
  fadeOutFrames: number;
};

export type CaptionConfigV1 = {
  enabled: boolean;
  source: "none" | "manual" | "srt";
  style: "clean" | "tiktok" | "news";
  entries: CaptionEntryV1[];
  options: {
    maxWordsPerPage: number;
    highlightCurrentWord: boolean;
    position: "top" | "center" | "bottom";
    fontSize: number;
  };
};

export type CaptionEntryV1 = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  tokens?: Array<{
    text: string;
    startMs: number;
    endMs: number;
  }>;
};

export type ExportConfigV1 = {
  preset: "draft" | "vertical-h264" | "vertical-high";
  codec: "h264";
  muted: boolean;
  fileName?: string;
};
```

## 3. Validation rules

### Composition

- Width: 320–3840.
- Height: 320–3840.
- FPS: 24, 25, 30, 50 or 60.
- MVP UI creates 1080 × 1920 at 30 FPS.
- Background must be a valid six- or eight-digit hex color.

### Scenes

- At least one enabled scene.
- Maximum 100 scenes.
- Scene IDs are unique.
- Duration is at least 6 frames.
- Total duration maximum in MVP: 10,800 frames at 60 FPS equivalent, enforced as 180 seconds.
- Transition duration cannot exceed half of scene duration.
- A media asset ID must be a UUID.
- Position X/Y: 0–1.
- Scale: 0.1–5.
- Playback rate: 0.25–4.
- Start offset cannot be negative.
- Bullet list maximum: 10 entries.
- Each bullet maximum: 240 characters.
- Headline maximum: 300 characters.
- Body maximum: 5,000 characters.

### Audio

- Volume: 0–1.
- Start frame: non-negative.
- Fade frames: non-negative.
- Asset must be READY and audio-compatible before rendering.

### Captions

- `startMs >= 0`.
- `endMs > startMs`.
- Entries sorted by `startMs`.
- Overlap may be accepted but returns a warning.
- Caption text cannot be blank.
- Token timing must remain inside parent entry timing.

## 4. Duration calculation

Only enabled scenes contribute.

```ts
export const getTotalDurationInFrames = (
  project: ProjectDocumentV1,
): number => {
  return project.scenes
    .filter((scene) => scene.enabled)
    .reduce((total, scene) => total + scene.durationInFrames, 0);
};
```

The Remotion composition uses `calculateMetadata()`:

```ts
export const calculateProjectMetadata:
  CalculateMetadataFunction<VideoProps> = ({props}) => {
    const project = ProjectDocumentSchema.parse(props.project);

    return {
      durationInFrames: getTotalDurationInFrames(project),
      width: project.composition.width,
      height: project.composition.height,
      fps: project.composition.fps,
      defaultCodec: "h264",
      props: {project},
    };
  };
```

## 5. Scene start calculation

```ts
export const getSceneRanges = (project: ProjectDocumentV1) => {
  let cursor = 0;

  return project.scenes
    .filter((scene) => scene.enabled)
    .map((scene) => {
      const range = {
        sceneId: scene.id,
        from: cursor,
        durationInFrames: scene.durationInFrames,
        toExclusive: cursor + scene.durationInFrames,
      };

      cursor += scene.durationInFrames;
      return range;
    });
};
```

## 6. Asset extraction

Before render, collect all referenced asset IDs from:

- Theme logo.
- Every scene media.
- Voice-over.
- Background music.

These IDs become `RevisionAsset` rows.

## 7. Script import schema

Script import is transient and is not stored as the final project format.

```ts
type ScriptImportRequest = {
  rawText: string;
  splitMode: "blank-line" | "delimiter" | "single";
  delimiter?: string;
  defaultSceneType: SceneV1["type"];
  defaultDurationInFrames: number;
};

type ScriptImportPreview = {
  scenes: Array<{
    name: string;
    body: string;
    type: SceneV1["type"];
    durationInFrames: number;
  }>;
  warnings: string[];
};
```

No AI or semantic analysis is performed.

## 8. Migration contract

```ts
type ProjectMigration = {
  from: number;
  to: number;
  migrate: (input: unknown) => unknown;
};
```

Rules:

1. Parse the `schemaVersion` first.
2. Apply migrations sequentially.
3. Validate the final document.
4. Never mutate an immutable revision in the database.
5. The editor may migrate a draft on load and save it as the newest schema.
6. A render of an old revision may migrate it in memory.

## 9. Example

See `examples/project.example.json`.

## 10. Machine-readable schema

See `schemas/project.schema.json`.
