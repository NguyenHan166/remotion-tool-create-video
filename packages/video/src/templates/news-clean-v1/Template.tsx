import { validateNewsCleanV1, type TemplateComponentProps } from '@hansys/template-registry';
import { AbsoluteFill, Series } from 'remotion';
import { InvalidTemplateProjectError } from './errors.js';
import { BackgroundMusicLayer } from './BackgroundMusicLayer.js';
import { CaptionLayer } from './CaptionLayer.js';
import { SceneRenderer } from './SceneRenderer.js';
import { SharedLayers } from './components.js';
import { NEWS_CLEAN_COLORS, NEWS_CLEAN_FONT_FAMILY } from './tokens.js';
import { VoiceoverLayer } from './VoiceoverLayer.js';

export function NewsCleanV1Template({ project, assets }: TemplateComponentProps) {
  const validation = validateNewsCleanV1(project);

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
        backgroundColor: NEWS_CLEAN_COLORS.paper,
        color: NEWS_CLEAN_COLORS.ink,
        fontFamily: NEWS_CLEAN_FONT_FAMILY,
      }}
    >
      <Series>
        {enabledScenes.map((scene) => (
          <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
            <SceneRenderer assets={assets} project={project} scene={scene} />
          </Series.Sequence>
        ))}
      </Series>
      <SharedLayers assets={assets} durationInFrames={durationInFrames} project={project} />
      <CaptionLayer project={project} />
      <VoiceoverLayer assets={assets} project={project} />
      <BackgroundMusicLayer assets={assets} durationInFrames={durationInFrames} project={project} />
    </AbsoluteFill>
  );
}
