import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ResponsiveText, SafeArea, SourceBadge } from '../components.js';
import { type NewsCleanSceneProps } from '../SceneRenderer.js';
import { NEWS_CLEAN_COLORS, NEWS_CLEAN_FONT_FAMILY } from '../tokens.js';

export function HookScene({ project, scene }: NewsCleanSceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headlineProgress = spring({
    frame,
    fps,
    config: { damping: 24, mass: 0.9, stiffness: 120 },
    durationInFrames: Math.min(22, scene.durationInFrames),
  });
  const bodyOpacity = interpolate(frame, [8, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: NEWS_CLEAN_COLORS.paper }}>
      <SafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '10%' }}
      >
        <div
          style={{
            alignItems: scene.style.textAlign === 'center' ? 'center' : 'flex-start',
            display: 'flex',
            flexDirection: 'column',
            gap: 34,
          }}
        >
          <div
            style={{
              color: NEWS_CLEAN_COLORS.accent,
              fontFamily: NEWS_CLEAN_FONT_FAMILY,
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: '0.16em',
              textAlign: scene.style.textAlign,
              textTransform: 'uppercase',
            }}
          >
            {scene.text.label ?? 'TIN MỚI'}
          </div>
          <div
            style={{
              transform: `translateY(${(1 - headlineProgress) * 38}px)`,
            }}
          >
            <ResponsiveText
              align={scene.style.textAlign}
              kind="display"
              maxLines={5}
              text={scene.text.headline}
            />
          </div>
          <div
            style={{
              backgroundColor: NEWS_CLEAN_COLORS.accent,
              height: 6,
              transform: `scaleX(${headlineProgress})`,
              transformOrigin:
                scene.style.textAlign === 'right'
                  ? 'right center'
                  : scene.style.textAlign === 'center'
                    ? 'center'
                    : 'left center',
              width: '32%',
            }}
          />
          <div style={{ opacity: bodyOpacity }}>
            <ResponsiveText
              align={scene.style.textAlign}
              color={NEWS_CLEAN_COLORS.muted}
              kind="body"
              maxLines={5}
              text={scene.text.body}
            />
          </div>
          <SourceBadge source={scene.text.source} />
        </div>
      </SafeArea>
    </AbsoluteFill>
  );
}
