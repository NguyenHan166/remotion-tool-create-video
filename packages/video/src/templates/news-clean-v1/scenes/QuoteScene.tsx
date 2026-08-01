import { AbsoluteFill } from 'remotion';
import { ResponsiveText, resolveSceneSource, SafeArea, SourceBadge } from '../components.js';
import { type NewsCleanSceneProps } from '../SceneRenderer.js';
import { NEWS_CLEAN_COLORS, NEWS_CLEAN_FONT_FAMILY } from '../tokens.js';

export function QuoteScene({ project, scene }: NewsCleanSceneProps) {
  const quote = scene.text.body ?? scene.text.headline;

  return (
    <AbsoluteFill style={{ backgroundColor: NEWS_CLEAN_COLORS.navy }}>
      <SafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '11%' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
          <div
            style={{
              color: NEWS_CLEAN_COLORS.accent,
              fontFamily: 'Georgia, serif',
              fontSize: 150,
              height: 80,
              lineHeight: 0.9,
            }}
          >
            “
          </div>
          <ResponsiveText
            align={scene.style.textAlign}
            color={NEWS_CLEAN_COLORS.white}
            kind="headline"
            maxLines={7}
            text={quote}
          />
          {scene.text.quoteAuthor === undefined ? null : (
            <div
              style={{
                color: NEWS_CLEAN_COLORS.secondary,
                fontFamily: NEWS_CLEAN_FONT_FAMILY,
                fontSize: 28,
                fontWeight: 650,
                textAlign: scene.style.textAlign,
              }}
            >
              — {scene.text.quoteAuthor}
            </div>
          )}
          <SourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </SafeArea>
    </AbsoluteFill>
  );
}
