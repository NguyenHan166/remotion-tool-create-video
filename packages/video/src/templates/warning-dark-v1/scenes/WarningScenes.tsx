import { type SceneV1 } from '@hansys/project-schema';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { type WarningSceneProps } from '../SceneRenderer.js';
import {
  resolveSceneAsset,
  WarningIcon,
  WarningMediaFrame,
  WarningSafeArea,
  WarningSourceBadge,
  WarningText,
  resolveSceneSource,
} from '../components.js';
import { WARNING_DARK_COLORS, WARNING_DARK_FONT_FAMILY } from '../tokens.js';

function SceneLabel({ text, align }: { text: string; align: SceneV1['style']['textAlign'] }) {
  return (
    <div
      style={{
        color: WARNING_DARK_COLORS.yellow,
        fontFamily: WARNING_DARK_FONT_FAMILY,
        fontSize: 22,
        fontWeight: 900,
        letterSpacing: '0.13em',
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

function getWarningLabel(scene: SceneV1, fallback: string) {
  if (scene.style.variant === 'cyber') {
    return 'AN NINH MẠNG';
  }

  if (scene.style.variant === 'scam') {
    return 'LỪA ĐẢO';
  }

  return scene.text.label ?? fallback;
}

export function WarningHookScene({ project, scene }: WarningSceneProps) {
  const frame = useCurrentFrame();
  const accentProgress = interpolate(frame, [2, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: WARNING_DARK_COLORS.background }}>
      <div
        style={{
          backgroundColor: WARNING_DARK_COLORS.redDeep,
          height: '42%',
          position: 'absolute',
          right: '-22%',
          top: '-18%',
          transform: 'rotate(-12deg)',
          width: '125%',
        }}
      />
      <WarningSafeArea
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
          <SceneLabel align={scene.style.textAlign} text={getWarningLabel(scene, 'CẢNH BÁO')} />
          <WarningText
            align={scene.style.textAlign}
            color={WARNING_DARK_COLORS.white}
            kind="display"
            maxLines={6}
            text={scene.text.headline}
          />
          <div
            style={{
              backgroundColor: WARNING_DARK_COLORS.red,
              height: 9,
              transform: `scaleX(${accentProgress})`,
              transformOrigin: scene.style.textAlign === 'right' ? 'right' : 'left',
              width: '35%',
            }}
          />
          <WarningText
            align={scene.style.textAlign}
            color={WARNING_DARK_COLORS.softWhite}
            kind="body"
            maxLines={6}
            text={scene.text.body}
          />
          <WarningSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </WarningSafeArea>
    </AbsoluteFill>
  );
}

export function WarningHeadlineScene({ project, scene }: WarningSceneProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: WARNING_DARK_COLORS.background }}>
      <WarningSafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '12%' }}
      >
        <div
          style={{
            backgroundColor: WARNING_DARK_COLORS.panel,
            borderLeft: `12px solid ${WARNING_DARK_COLORS.red}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
            padding: '34px 34px 38px',
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: 18 }}>
            <WarningIcon size={54} />
            <SceneLabel align={scene.style.textAlign} text={getWarningLabel(scene, 'CẢNH BÁO')} />
          </div>
          <WarningText
            align={scene.style.textAlign}
            color={WARNING_DARK_COLORS.white}
            kind="display"
            maxLines={6}
            text={scene.text.headline}
          />
          <WarningText
            align={scene.style.textAlign}
            color={WARNING_DARK_COLORS.softWhite}
            kind="body"
            maxLines={6}
            text={scene.text.body}
          />
          <WarningSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </WarningSafeArea>
    </AbsoluteFill>
  );
}

export function WarningContentScene({ project, scene }: WarningSceneProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: WARNING_DARK_COLORS.background }}>
      <WarningSafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '12%' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <SceneLabel align={scene.style.textAlign} text={getWarningLabel(scene, 'THÔNG TIN')} />
          <WarningText
            align={scene.style.textAlign}
            kind="headline"
            maxLines={5}
            text={scene.text.headline}
          />
          <div
            style={{
              backgroundColor: WARNING_DARK_COLORS.panel,
              border: `1px solid ${WARNING_DARK_COLORS.rule}`,
              borderRadius: 14,
              padding: '26px 28px',
            }}
          >
            <WarningText
              align={scene.style.textAlign}
              color={WARNING_DARK_COLORS.softWhite}
              kind="body"
              maxLines={10}
              text={scene.text.body}
            />
          </div>
          <WarningSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </WarningSafeArea>
    </AbsoluteFill>
  );
}

export function WarningBulletListScene({ project, scene }: WarningSceneProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const bullets = scene.text.bullets ?? [];
  const fontSize = Math.max(
    23,
    Math.round(Math.min(width, height) * (bullets.length > 6 ? 0.024 : 0.029)),
  );

  return (
    <AbsoluteFill style={{ backgroundColor: WARNING_DARK_COLORS.background }}>
      <WarningSafeArea
        captionsEnabled={project.captions.enabled}
        style={{ justifyContent: 'center', paddingTop: '11%' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 18 }}>
            <WarningIcon size={58} />
            <SceneLabel
              align={scene.style.textAlign}
              text={getWarningLabel(scene, 'ĐIỂM CẦN NHỚ')}
            />
          </div>
          <WarningText
            align={scene.style.textAlign}
            kind="headline"
            maxLines={4}
            text={scene.text.headline}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {bullets.map((bullet, index) => {
              const opacity = interpolate(frame, [4 + index * 4, 12 + index * 4], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });

              return (
                <div
                  key={`${index}-${bullet}`}
                  style={{
                    alignItems: 'flex-start',
                    backgroundColor:
                      index % 2 === 0 ? WARNING_DARK_COLORS.panel : WARNING_DARK_COLORS.panelRaised,
                    borderLeft: `9px solid ${index === 0 ? WARNING_DARK_COLORS.red : WARNING_DARK_COLORS.yellow}`,
                    display: 'flex',
                    fontFamily: WARNING_DARK_FONT_FAMILY,
                    fontSize,
                    fontWeight: 650,
                    gap: 18,
                    lineHeight: 1.3,
                    opacity,
                    padding: '17px 20px',
                    transform: `translateX(${(1 - opacity) * 28}px)`,
                  }}
                >
                  <span
                    style={{
                      color: index === 0 ? WARNING_DARK_COLORS.red : WARNING_DARK_COLORS.yellow,
                      fontWeight: 900,
                    }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      color: WARNING_DARK_COLORS.white,
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
          <WarningSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </WarningSafeArea>
    </AbsoluteFill>
  );
}

export function WarningMediaScene({ project, scene, assets }: WarningSceneProps) {
  const { width, height } = useVideoConfig();
  const asset = resolveSceneAsset(scene, assets);
  const landscape = width > height;

  if (asset === undefined) {
    return null;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: WARNING_DARK_COLORS.background }}>
      <WarningSafeArea
        captionsEnabled={project.captions.enabled}
        style={{
          flexDirection: landscape ? 'row' : 'column',
          gap: landscape ? '4%' : '3%',
          justifyContent: 'center',
          paddingTop: '10%',
        }}
      >
        <WarningMediaFrame
          asset={asset}
          scene={scene}
          style={{
            flex: landscape ? '1.25 1 0' : '0 0 52%',
            minHeight: 0,
            minWidth: 0,
          }}
        />
        <div
          style={{
            display: 'flex',
            flex: '1 1 0',
            flexDirection: 'column',
            gap: 20,
            justifyContent: 'center',
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <SceneLabel align={scene.style.textAlign} text={getWarningLabel(scene, 'CẢNH BÁO')} />
          <WarningText
            align={scene.style.textAlign}
            kind="headline"
            maxLines={4}
            text={scene.text.headline}
          />
          <WarningText
            align={scene.style.textAlign}
            color={WARNING_DARK_COLORS.softWhite}
            kind="body"
            maxLines={landscape ? 5 : 4}
            text={scene.text.body}
          />
          <WarningSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </WarningSafeArea>
    </AbsoluteFill>
  );
}

export function WarningQuoteScene({ project, scene }: WarningSceneProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: WARNING_DARK_COLORS.redDeep }}>
      <WarningSafeArea
        captionsEnabled={project.captions.enabled}
        style={{ alignItems: 'center', justifyContent: 'center', paddingTop: '10%' }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 26,
            textAlign: 'center',
          }}
        >
          <WarningIcon />
          <WarningText
            align="center"
            color={WARNING_DARK_COLORS.white}
            kind="display"
            maxLines={7}
            text={scene.text.headline ?? scene.text.body}
          />
          <WarningText
            align="center"
            color={WARNING_DARK_COLORS.softWhite}
            kind="body"
            maxLines={3}
            text={scene.text.quoteAuthor}
          />
          <WarningSourceBadge
            accentColor={project.theme.accentColor}
            mutedColor={project.theme.mutedTextColor}
            source={resolveSceneSource(project, scene)}
          />
        </div>
      </WarningSafeArea>
    </AbsoluteFill>
  );
}

export function WarningOutroScene({ project, scene }: WarningSceneProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: WARNING_DARK_COLORS.ink }}>
      <WarningSafeArea
        captionsEnabled={project.captions.enabled}
        style={{ alignItems: 'center', justifyContent: 'center', paddingTop: '10%' }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 26,
            textAlign: 'center',
            width: '100%',
          }}
        >
          <WarningIcon />
          <WarningText align="center" kind="display" maxLines={5} text={scene.text.headline} />
          <WarningText
            align="center"
            color={WARNING_DARK_COLORS.softWhite}
            kind="body"
            maxLines={5}
            text={scene.text.body}
          />
          <SceneLabel align="center" text={scene.text.label ?? project.metadata.title} />
        </div>
      </WarningSafeArea>
    </AbsoluteFill>
  );
}
