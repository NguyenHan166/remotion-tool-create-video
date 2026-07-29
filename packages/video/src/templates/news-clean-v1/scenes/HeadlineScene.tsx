import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { ResponsiveText, SafeArea, SourceBadge } from '../components.js';
import { type NewsCleanSceneProps } from '../SceneRenderer.js';
import { NEWS_CLEAN_COLORS, NEWS_CLEAN_FONT_FAMILY } from '../tokens.js';

export function HeadlineScene({ project, scene }: NewsCleanSceneProps) {
  const frame = useCurrentFrame();
  const ruleProgress = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: NEWS_CLEAN_COLORS.paper }}>
      <SafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '12%' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
          <div
            style={{
              color: NEWS_CLEAN_COLORS.accent,
              fontFamily: NEWS_CLEAN_FONT_FAMILY,
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: '0.13em',
              textAlign: scene.style.textAlign,
              textTransform: 'uppercase',
            }}
          >
            {scene.text.label ?? 'BẢN TIN'}
          </div>
          <ResponsiveText
            align={scene.style.textAlign}
            kind="display"
            maxLines={5}
            text={scene.text.headline}
          />
          <div
            style={{
              backgroundColor: NEWS_CLEAN_COLORS.navy,
              height: 8,
              transform: `scaleX(${ruleProgress})`,
              transformOrigin: 'left center',
              width: '100%',
            }}
          />
          <ResponsiveText
            align={scene.style.textAlign}
            color={NEWS_CLEAN_COLORS.muted}
            kind="body"
            maxLines={5}
            text={scene.text.body}
          />
          <SourceBadge source={scene.text.source} />
        </div>
      </SafeArea>
    </AbsoluteFill>
  );
}
