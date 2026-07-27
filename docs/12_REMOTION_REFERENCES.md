# 12 — Remotion Reference Notes

Checked on 2026-07-27.

Official references used for architecture decisions:

- Remotion Player: https://www.remotion.dev/docs/player
- renderMedia: https://www.remotion.dev/docs/renderer/render-media
- selectComposition: https://www.remotion.dev/docs/renderer/select-composition
- bundle: https://www.remotion.dev/docs/bundle
- calculateMetadata: https://www.remotion.dev/docs/calculate-metadata
- upgrading and exact package versions: https://www.remotion.dev/docs/upgrading
- main product and license overview: https://www.remotion.dev/

Key implementation notes to re-check against installed type definitions:

- Player embeds a composition in a React app and accepts runtime content.
- `renderMedia()` renders programmatically and accepts JSON input props.
- Pass the same input props to `selectComposition()` and `renderMedia()`.
- `calculateMetadata()` can derive dynamic duration, dimensions and FPS.
- `bundle()` should be reused and called only when source changes.
- All Remotion packages should be upgraded together and pinned exactly.
- The reference version at document creation was `4.0.499`.

Before a future major version upgrade, create an ADR and follow the official migration guide.
