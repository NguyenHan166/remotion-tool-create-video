import { validateBreakingRedV1, type TemplateComponentProps } from '@hansys/template-registry';
import { AbsoluteFill, Series } from 'remotion';
import { BackgroundMusicLayer } from '../news-clean-v1/BackgroundMusicLayer.js';
import { CaptionLayer } from '../news-clean-v1/CaptionLayer.js';
import { VoiceoverLayer } from '../news-clean-v1/VoiceoverLayer.js';
import { InvalidTemplateProjectError } from './errors.js';
import { BreakingSceneRenderer } from './SceneRenderer.js';
import { BreakingSharedLayers } from './components.js';
import { BREAKING_RED_COLORS, BREAKING_RED_FONT_FAMILY } from './tokens.js';

export function BreakingRedV1Template({ project, assets }: TemplateComponentProps) {
  const validation = validateBreakingRedV1(project);

  if (validation.errors.length > 0) {
    throw new InvalidTemplateProjectError(validation.errors);
  }

  const enabledScenes = project.scenes.filter((scene) => scene.enabled);
  const durationInFrames = enabledScenes.reduce(
    (total, scene) => total + scene.durationInFrames,
    0,
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BREAKING_RED_COLORS.background,
        color: BREAKING_RED_COLORS.white,
        fontFamily: BREAKING_RED_FONT_FAMILY,
      }}
    >
      <Series>
        {enabledScenes.map((scene) => (
          <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
            <BreakingSceneRenderer assets={assets} project={project} scene={scene} />
          </Series.Sequence>
        ))}
      </Series>
      <BreakingSharedLayers assets={assets} durationInFrames={durationInFrames} project={project} />
      <CaptionLayer project={project} />
      <VoiceoverLayer assets={assets} project={project} />
      <BackgroundMusicLayer assets={assets} durationInFrames={durationInFrames} project={project} />
    </AbsoluteFill>
  );
}
