import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { ResponsiveText, SafeArea } from '../components.js';
import { type NewsCleanSceneProps } from '../SceneRenderer.js';
import { NEWS_CLEAN_COLORS, NEWS_CLEAN_FONT_FAMILY } from '../tokens.js';

export function OutroScene({ project, scene }: NewsCleanSceneProps) {
  const frame = useCurrentFrame();
  const accentScale = interpolate(frame, [4, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: NEWS_CLEAN_COLORS.paper }}>
      <SafeArea
        captionsEnabled={project.captions.enabled}
        style={{ alignItems: 'center', justifyContent: 'center', paddingTop: '10%' }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 32,
            width: '100%',
          }}
        >
          <div
            style={{
              backgroundColor: NEWS_CLEAN_COLORS.accent,
              height: 10,
              transform: `scaleX(${accentScale})`,
              width: 150,
            }}
          />
          <ResponsiveText
            align={scene.style.textAlign}
            kind="display"
            maxLines={4}
            text={scene.text.headline}
          />
          <ResponsiveText
            align={scene.style.textAlign}
            color={NEWS_CLEAN_COLORS.muted}
            kind="body"
            maxLines={4}
            text={scene.text.body}
          />
          <div
            style={{
              color: NEWS_CLEAN_COLORS.navy,
              fontFamily: NEWS_CLEAN_FONT_FAMILY,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '0.14em',
              marginTop: 20,
              textTransform: 'uppercase',
            }}
          >
            {scene.text.label ?? project.metadata.title}
          </div>
        </div>
      </SafeArea>
    </AbsoluteFill>
  );
}
