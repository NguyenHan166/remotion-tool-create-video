import { type SceneV1 } from '@hansys/project-schema';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { type BreakingSceneProps } from '../SceneRenderer.js';
import {
  BreakingMediaFrame,
  BreakingSafeArea,
  BreakingSourceBadge,
  BreakingText,
  resolveSceneSource,
  resolveSceneAsset,
  WarningIcon,
} from '../components.js';
import { BREAKING_RED_COLORS, BREAKING_RED_FONT_FAMILY } from '../tokens.js';

function SceneLabel({ text, align }: { text: string; align: SceneV1['style']['textAlign'] }) {
  return (
    <div
      style={{
        color: BREAKING_RED_COLORS.accent,
        fontFamily: BREAKING_RED_FONT_FAMILY,
        fontSize: 24,
        fontWeight: 900,
        letterSpacing: '0.14em',
        textAlign: align,
        textTransform: 'uppercase',
      }}
    >
      {text}
    </div>
  );
}

function alignItemsFor(align: SceneV1['style']['textAlign']) {
  return align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
}

export function BreakingHookScene({ project, scene }: BreakingSceneProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: BREAKING_RED_COLORS.red }}>
      <div
        style={{
          backgroundColor: BREAKING_RED_COLORS.ink,
          height: '38%',
          position: 'absolute',
          right: '-15%',
          top: '-12%',
          transform: 'rotate(-13deg)',
          width: '120%',
        }}
      />
      <BreakingSafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '12%' }}
      >
        <div
          style={{
            alignItems: alignItemsFor(scene.style.textAlign),
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
          }}
        >
          <WarningIcon />
          <SceneLabel align={scene.style.textAlign} text={scene.text.label ?? 'TIN KHẨN'} />
          <BreakingText
            align={scene.style.textAlign}
            kind="display"
            maxLines={6}
            text={scene.text.headline}
          />
          <div
            style={{
              backgroundColor: BREAKING_RED_COLORS.accent,
              height: 10,
              width: '34%',
            }}
          />
          <BreakingText
            align={scene.style.textAlign}
            color={BREAKING_RED_COLORS.softWhite}
            kind="body"
            maxLines={6}
            text={scene.text.body}
          />
          <BreakingSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </BreakingSafeArea>
    </AbsoluteFill>
  );
}

export function BreakingHeadlineScene({ project, scene }: BreakingSceneProps) {
  const frame = useCurrentFrame();
  const ruleProgress = interpolate(frame, [2, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BREAKING_RED_COLORS.background }}>
      <BreakingSafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '12%' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <SceneLabel align={scene.style.textAlign} text={scene.text.label ?? 'MỚI NHẤT'} />
          <BreakingText
            align={scene.style.textAlign}
            kind="display"
            maxLines={6}
            text={scene.text.headline}
          />
          <div
            style={{
              backgroundColor: BREAKING_RED_COLORS.redBright,
              height: 12,
              transform: `scaleX(${ruleProgress})`,
              transformOrigin: scene.style.textAlign === 'right' ? 'right' : 'left',
              width: '100%',
            }}
          />
          <BreakingText
            align={scene.style.textAlign}
            color={BREAKING_RED_COLORS.softWhite}
            kind="body"
            maxLines={6}
            text={scene.text.body}
          />
          <BreakingSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </BreakingSafeArea>
    </AbsoluteFill>
  );
}

export function BreakingContentScene({ project, scene }: BreakingSceneProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: BREAKING_RED_COLORS.background }}>
      <BreakingSafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '12%' }}
      >
        <div
          style={{
            borderLeft: `14px solid ${BREAKING_RED_COLORS.redBright}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
            paddingLeft: 34,
          }}
        >
          <SceneLabel align={scene.style.textAlign} text={scene.text.label ?? 'CẬP NHẬT'} />
          <BreakingText
            align={scene.style.textAlign}
            kind="headline"
            maxLines={5}
            text={scene.text.headline}
          />
          <BreakingText
            align={scene.style.textAlign}
            color={BREAKING_RED_COLORS.softWhite}
            kind="body"
            maxLines={9}
            text={scene.text.body}
          />
          <BreakingSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </BreakingSafeArea>
    </AbsoluteFill>
  );
}

export function BreakingBulletListScene({ project, scene }: BreakingSceneProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const bullets = scene.text.bullets ?? [];
  const fontSize = Math.max(
    24,
    Math.round(Math.min(width, height) * (bullets.length > 6 ? 0.026 : 0.032)),
  );

  return (
    <AbsoluteFill style={{ backgroundColor: BREAKING_RED_COLORS.background }}>
      <BreakingSafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '11%' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <SceneLabel align={scene.style.textAlign} text={scene.text.label ?? 'ĐIỂM NÓNG'} />
          <BreakingText
            align={scene.style.textAlign}
            kind="headline"
            maxLines={4}
            text={scene.text.headline}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {bullets.map((bullet, index) => {
              const opacity = interpolate(frame, [4 + index * 3, 10 + index * 3], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });

              return (
                <div
                  key={`${index}-${bullet}`}
                  style={{
                    alignItems: 'flex-start',
                    backgroundColor:
                      index % 2 === 0 ? BREAKING_RED_COLORS.red : BREAKING_RED_COLORS.redDeep,
                    border: `2px solid ${BREAKING_RED_COLORS.redBright}`,
                    color: BREAKING_RED_COLORS.white,
                    display: 'flex',
                    fontFamily: BREAKING_RED_FONT_FAMILY,
                    fontSize,
                    fontWeight: 700,
                    gap: 18,
                    lineHeight: 1.28,
                    opacity,
                    padding: '18px 22px',
                    transform: `translateX(${(1 - opacity) * 34}px)`,
                  }}
                >
                  <span style={{ color: BREAKING_RED_COLORS.accent, fontWeight: 900 }}>
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
          <BreakingSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </BreakingSafeArea>
    </AbsoluteFill>
  );
}

export function BreakingMediaScene({ project, scene, assets }: BreakingSceneProps) {
  const { width, height } = useVideoConfig();
  const asset = resolveSceneAsset(scene, assets);
  const landscape = width > height;

  if (asset === undefined) {
    return null;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: BREAKING_RED_COLORS.background }}>
      <BreakingSafeArea
        captionsEnabled={project.captions.enabled}
        style={{
          flexDirection: landscape ? 'row' : 'column',
          gap: landscape ? '4%' : '3%',
          justifyContent: 'center',
          paddingTop: '10%',
        }}
      >
        <BreakingMediaFrame
          asset={asset}
          scene={scene}
          style={{
            flex: landscape ? '1.35 1 0' : '0 0 52%',
            minHeight: 0,
            minWidth: 0,
          }}
        />
        <div
          style={{
            display: 'flex',
            flex: '1 1 0',
            flexDirection: 'column',
            gap: 22,
            justifyContent: 'center',
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <SceneLabel align={scene.style.textAlign} text={scene.text.label ?? 'HÌNH ẢNH'} />
          <BreakingText
            align={scene.style.textAlign}
            kind="headline"
            maxLines={4}
            text={scene.text.headline}
          />
          <BreakingText
            align={scene.style.textAlign}
            color={BREAKING_RED_COLORS.softWhite}
            kind="body"
            maxLines={landscape ? 5 : 4}
            text={scene.text.body}
          />
          <BreakingSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </BreakingSafeArea>
    </AbsoluteFill>
  );
}

export function BreakingQuoteScene({ project, scene }: BreakingSceneProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: BREAKING_RED_COLORS.red }}>
      <BreakingSafeArea
        captionsEnabled={project.captions.enabled}
        style={{ alignItems: 'center', justifyContent: 'center', paddingTop: '10%' }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              color: BREAKING_RED_COLORS.accent,
              fontFamily: 'Georgia, serif',
              fontSize: 150,
              fontWeight: 900,
              height: 100,
              lineHeight: 1,
            }}
          >
            “
          </div>
          <BreakingText
            align="center"
            color={BREAKING_RED_COLORS.white}
            kind="display"
            maxLines={7}
            text={scene.text.headline ?? scene.text.body}
          />
          <BreakingText
            align="center"
            color={BREAKING_RED_COLORS.softWhite}
            kind="body"
            maxLines={3}
            text={scene.text.quoteAuthor}
          />
          <BreakingSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </BreakingSafeArea>
    </AbsoluteFill>
  );
}

export function BreakingOutroScene({ project, scene }: BreakingSceneProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: BREAKING_RED_COLORS.ink }}>
      <BreakingSafeArea
        captionsEnabled={project.captions.enabled}
        style={{ alignItems: 'center', justifyContent: 'center', paddingTop: '10%' }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
            textAlign: 'center',
            width: '100%',
          }}
        >
          <WarningIcon />
          <BreakingText
            align={scene.style.textAlign}
            kind="display"
            maxLines={5}
            text={scene.text.headline}
          />
          <BreakingText
            align={scene.style.textAlign}
            color={BREAKING_RED_COLORS.softWhite}
            kind="body"
            maxLines={5}
            text={scene.text.body}
          />
          <SceneLabel align="center" text={scene.text.label ?? project.metadata.title} />
        </div>
      </BreakingSafeArea>
    </AbsoluteFill>
  );
}
