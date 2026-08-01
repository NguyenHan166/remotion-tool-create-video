import { AbsoluteFill } from 'remotion';
import { ResponsiveText, resolveSceneSource, SafeArea, SourceBadge } from '../components.js';
import { type NewsCleanSceneProps } from '../SceneRenderer.js';
import { NEWS_CLEAN_COLORS, NEWS_CLEAN_FONT_FAMILY } from '../tokens.js';

export function ContentScene({ project, scene }: NewsCleanSceneProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: NEWS_CLEAN_COLORS.paper }}>
      <SafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '12%' }}
      >
        <div
          style={{
            borderTop: `8px solid ${NEWS_CLEAN_COLORS.navy}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 32,
            paddingTop: 42,
          }}
        >
          <div
            style={{
              color: NEWS_CLEAN_COLORS.accent,
              fontFamily: NEWS_CLEAN_FONT_FAMILY,
              fontSize: 23,
              fontWeight: 800,
              letterSpacing: '0.12em',
              textAlign: scene.style.textAlign,
              textTransform: 'uppercase',
            }}
          >
            {scene.text.label ?? 'ĐIỂM CHÍNH'}
          </div>
          <ResponsiveText
            align={scene.style.textAlign}
            kind="headline"
            maxLines={4}
            text={scene.text.headline}
          />
          <ResponsiveText
            align={scene.style.textAlign}
            color={NEWS_CLEAN_COLORS.muted}
            kind="body"
            maxLines={9}
            text={scene.text.body}
          />
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
