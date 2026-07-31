import { Composition } from 'remotion';
import { PROJECT_VIDEO_COMPOSITION_ID } from './composition.js';
import { STUDIO_VIDEO_PROPS } from './fixture.js';
import { calculateProjectMetadata, getTotalDurationInFrames } from './metadata.js';
import { ProjectVideo } from './project-video.js';

export { PROJECT_VIDEO_COMPOSITION_ID } from './composition.js';

export function Root() {
  const { composition } = STUDIO_VIDEO_PROPS.project;

  return (
    <Composition
      id={PROJECT_VIDEO_COMPOSITION_ID}
      component={ProjectVideo}
      defaultProps={STUDIO_VIDEO_PROPS}
      durationInFrames={getTotalDurationInFrames(STUDIO_VIDEO_PROPS.project)}
      fps={composition.fps}
      width={composition.width}
      height={composition.height}
      calculateMetadata={calculateProjectMetadata}
    />
  );
}
