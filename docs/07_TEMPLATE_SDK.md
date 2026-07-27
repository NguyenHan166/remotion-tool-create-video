# 07 — Template SDK

## 1. Template philosophy

A template is trusted React code that renders a validated ProjectDocument.

A project chooses a template by ID and version. The user does not upload template JavaScript.

## 2. Manifest

```ts
export type TemplateManifest = {
  id: string;
  version: number;
  name: string;
  description: string;
  thumbnailAsset: string;
  supportedAspectRatios: Array<"9:16" | "16:9" | "1:1">;
  supportedSceneTypes: SceneV1["type"][];
  variants: Array<{
    id: string;
    name: string;
  }>;
  defaultProjectPatch: Partial<ProjectDocumentV1>;
  validate: (project: ProjectDocumentV1) => TemplateValidationResult;
  Component: React.ComponentType<TemplateComponentProps>;
};
```

## 3. Static registry

```ts
export const templateRegistry = {
  "news-clean-v1": newsCleanV1,
  "breaking-red-v1": breakingRedV1,
  "warning-dark-v1": warningDarkV1,
} satisfies Record<string, TemplateManifest>;
```

Rules:

- No registry entry generated from user input.
- Template ID is immutable.
- Breaking changes create a new ID or version implementation.
- Old version remains renderable as long as revisions reference it.

## 4. Folder structure

```text
packages/video/src/templates/news-clean-v1/
├── index.ts
├── manifest.ts
├── Template.tsx
├── SceneRenderer.tsx
├── scenes/
│   ├── HookScene.tsx
│   ├── HeadlineScene.tsx
│   ├── ContentScene.tsx
│   ├── ImageScene.tsx
│   ├── VideoScene.tsx
│   ├── BulletListScene.tsx
│   ├── QuoteScene.tsx
│   └── OutroScene.tsx
├── tokens.ts
├── fixture.ts
└── tests/
```

## 5. Shared composition

```tsx
export const ProjectVideo: React.FC<VideoProps> = ({project, assets}) => {
  const manifest = getTemplate(project.template.id, project.template.version);
  const Template = manifest.Component;

  return <Template project={project} assets={assets} />;
};
```

## 6. Scene sequencing

Templates receive sequential scenes.

Use `Series` for the core layout. Transition behavior must be deterministic and included in duration calculations.

MVP rule:

- Scene durations are not overlapped.
- A transition animates inside the outgoing or incoming scene.
- True overlap transitions may be added after the duration model is explicitly extended.

## 7. Layout rules

- Use composition-relative layout.
- Respect safe area:
  - top: 5%
  - horizontal: 6%
  - bottom: 12% when captions enabled
- Long Vietnamese text must not leave canvas.
- Headline components must define maximum lines or adaptive font sizing.
- Media must always specify cover or contain.
- Decorative overflow must be intentional.
- Avoid expensive full-frame blur in long scenes.
- Avoid remote fonts.

## 8. Animation rules

- Use `useCurrentFrame()`.
- Use `interpolate()`, `spring()` and deterministic easing.
- Animation values derive from frame and FPS.
- No CSS transition dependent on wall-clock time.
- No `setTimeout`.
- No unseeded randomness.
- Keep important text visible long enough to read.
- Scene entrance should not consume more than roughly 25% of short scene duration unless intentionally designed.

## 9. Asset resolver

Templates receive a map:

```ts
const asset = assets[scene.media.assetId];
```

A missing asset throws a typed template error in development and render validation catches it before rendering.

## 10. Base components

Build and reuse:

- `SafeArea`
- `ResponsiveText`
- `MediaFrame`
- `SourceBadge`
- `LogoMark`
- `Watermark`
- `ProgressBar`
- `CaptionLayer`
- `VoiceoverLayer`
- `BackgroundMusicLayer`
- `SceneErrorBoundary` for Player-only diagnostics
- `VietnameseTextMeasure`

## 11. Initial templates

### `news-clean-v1`

- Modern editorial look.
- Calm transitions.
- Strong headline.
- Source badge.
- Image and video scenes.
- Clean captions.

### `breaking-red-v1`

- Red visual system.
- Breaking label.
- Faster motion.
- High contrast.
- Progress indicator.

### `warning-dark-v1`

- Dark background.
- Red and yellow accents.
- Warning icon.
- Bullet-list emphasis.
- Suitable for scam and cyber warnings.

## 12. Template validation

A template returns errors and warnings.

Examples:

- Unsupported scene type: error.
- More than six bullets: warning or error depending on layout.
- Headline over 140 characters in a compact variant: warning.
- Missing source in news template: warning.
- No media in an image-only scene: error.

## 13. Template acceptance checklist

- Manifest registered.
- Fixture exists.
- Project schema validation passes.
- Template validation passes.
- Player preview works.
- Start, midpoint, boundary and final frame render.
- Vietnamese diacritics display correctly.
- Long text fixture does not visibly overflow.
- Image and video fit are correct.
- Caption safe area is respected.
- Audio does not unexpectedly clip.
