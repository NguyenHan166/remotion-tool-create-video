import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ResponsiveText, resolveSceneSource, SafeArea, SourceBadge } from '../components.js';
import { type NewsCleanSceneProps } from '../SceneRenderer.js';
import { NEWS_CLEAN_COLORS, NEWS_CLEAN_FONT_FAMILY } from '../tokens.js';

export function BulletListScene({ project, scene }: NewsCleanSceneProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const bullets = scene.text.bullets ?? [];
  const fontSize = Math.max(
    24,
    Math.round(Math.min(width, height) * (bullets.length > 6 ? 0.027 : 0.033)),
  );

  return (
    <AbsoluteFill style={{ backgroundColor: NEWS_CLEAN_COLORS.paper }}>
      <SafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '11%' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
          <ResponsiveText
            align={scene.style.textAlign}
            kind="headline"
            maxLines={3}
            text={scene.text.headline}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {bullets.map((bullet, index) => {
              const opacity = interpolate(frame, [8 + index * 4, 16 + index * 4], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });

              return (
                <div
                  key={`${index}-${bullet}`}
                  style={{
                    alignItems: 'flex-start',
                    backgroundColor: NEWS_CLEAN_COLORS.white,
                    borderLeft: `7px solid ${index === 0 ? NEWS_CLEAN_COLORS.accent : NEWS_CLEAN_COLORS.navy}`,
                    borderRadius: '0 18px 18px 0',
                    color: NEWS_CLEAN_COLORS.ink,
                    display: 'flex',
                    fontFamily: NEWS_CLEAN_FONT_FAMILY,
                    fontSize,
                    fontWeight: 650,
                    gap: 20,
                    lineHeight: 1.35,
                    opacity,
                    padding: '20px 24px',
                    transform: `translateX(${(1 - opacity) * 28}px)`,
                  }}
                >
                  <span style={{ color: NEWS_CLEAN_COLORS.accent, fontWeight: 800 }}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      display: '-webkit-box',
                      overflow: 'hidden',
                      overflowWrap: 'anywhere',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                    }}
                  >
                    {bullet}
                  </span>
                </div>
              );
            })}
          </div>
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
