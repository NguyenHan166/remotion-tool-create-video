import { Composition } from 'remotion';
import { STUDIO_VIDEO_PROPS } from './fixture.js';
import { calculateProjectMetadata, getTotalDurationInFrames } from './metadata.js';
import { ProjectVideo } from './project-video.js';

export const PROJECT_VIDEO_COMPOSITION_ID = 'ProjectVideo';

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
