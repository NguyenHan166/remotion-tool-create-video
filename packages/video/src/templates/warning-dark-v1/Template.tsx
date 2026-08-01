import { validateWarningDarkV1, type TemplateComponentProps } from '@hansys/template-registry';
import { AbsoluteFill, Series } from 'remotion';
import { BackgroundMusicLayer } from '../news-clean-v1/BackgroundMusicLayer.js';
import { CaptionLayer } from '../news-clean-v1/CaptionLayer.js';
import { VoiceoverLayer } from '../news-clean-v1/VoiceoverLayer.js';
import { WarningSharedLayers } from './components.js';
import { InvalidTemplateProjectError } from './errors.js';
import { WarningSceneRenderer } from './SceneRenderer.js';
import { WARNING_DARK_COLORS, WARNING_DARK_FONT_FAMILY } from './tokens.js';

export function WarningDarkV1Template({ project, assets }: TemplateComponentProps) {
  const validation = validateWarningDarkV1(project);

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
        backgroundColor: WARNING_DARK_COLORS.background,
        color: WARNING_DARK_COLORS.white,
        fontFamily: WARNING_DARK_FONT_FAMILY,
      }}
    >
      <Series>
        {enabledScenes.map((scene) => (
          <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
            <WarningSceneRenderer assets={assets} project={project} scene={scene} />
          </Series.Sequence>
        ))}
      </Series>
      <WarningSharedLayers assets={assets} durationInFrames={durationInFrames} project={project} />
      <CaptionLayer project={project} />
      <VoiceoverLayer assets={assets} project={project} />
      <BackgroundMusicLayer assets={assets} durationInFrames={durationInFrames} project={project} />
    </AbsoluteFill>
  );
}
