import { type ProjectDocumentV1, type SceneV1 } from '@hansys/project-schema';
import { type TemplateAsset } from '@hansys/template-registry';
import { type CSSProperties, type ReactNode } from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { MissingTemplateAssetError } from './errors.js';
import { BREAKING_RED_COLORS, BREAKING_RED_FONT_FAMILY, BREAKING_RED_SAFE_AREA } from './tokens.js';

type SafeAreaProps = {
  captionsEnabled: boolean;
  children: ReactNode;
  style?: CSSProperties;
};

export function BreakingSafeArea({ captionsEnabled, children, style }: SafeAreaProps) {
  return (
    <AbsoluteFill
      style={{
        boxSizing: 'border-box',
        paddingBottom: captionsEnabled
          ? BREAKING_RED_SAFE_AREA.captionBottom
          : BREAKING_RED_SAFE_AREA.bottom,
        paddingLeft: BREAKING_RED_SAFE_AREA.horizontal,
        paddingRight: BREAKING_RED_SAFE_AREA.horizontal,
        paddingTop: BREAKING_RED_SAFE_AREA.top,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

export type BreakingTextKind = 'display' | 'headline' | 'body';

export function getBreakingHeadlineFontSize(
  textLength: number,
  width: number,
  height: number,
): number {
  const shortSide = Math.min(width, height);
  const scale = shortSide / 1_080;
  const fit = Math.sqrt(72 / Math.max(textLength, 72));

  return Math.round(Math.max(36, Math.min(104, 104 * fit)) * scale);
}

function getBreakingFontSize(
  textLength: number,
  kind: BreakingTextKind,
  width: number,
  height: number,
): number {
  if (kind === 'display') {
    return getBreakingHeadlineFontSize(textLength, width, height);
  }

  const shortSide = Math.min(width, height);
  const scale = shortSide / 1_080;
  const settings = {
    headline: { max: 72, min: 32, target: 110 },
    body: { max: 38, min: 24, target: 230 },
  }[kind];
  const fit = Math.sqrt(settings.target / Math.max(textLength, settings.target));

  return Math.round(Math.max(settings.min, settings.max * fit) * scale);
}

export function BreakingText({
  text,
  kind,
  align = 'left',
  color = BREAKING_RED_COLORS.white,
  maxLines,
  style,
}: {
  text: string | undefined;
  kind: BreakingTextKind;
  align?: SceneV1['style']['textAlign'];
  color?: string;
  maxLines?: number;
  style?: CSSProperties;
}) {
  const { width, height } = useVideoConfig();

  if (text === undefined || text.trim().length === 0) {
    return null;
  }

  const resolvedMaxLines = maxLines ?? (kind === 'body' ? 7 : kind === 'headline' ? 5 : 6);

  return (
    <div
      style={{
        color,
        display: '-webkit-box',
        fontFamily: BREAKING_RED_FONT_FAMILY,
        fontSize: getBreakingFontSize(text.length, kind, width, height),
        fontWeight: kind === 'body' ? 500 : 850,
        letterSpacing: kind === 'display' ? '-0.045em' : '-0.028em',
        lineHeight: kind === 'body' ? 1.42 : 1.07,
        overflow: 'hidden',
        overflowWrap: 'anywhere',
        textAlign: align,
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: resolvedMaxLines,
        ...style,
      }}
    >
      {text}
    </div>
  );
}

export function BreakingSourceBadge({
  source,
  accentColor = BREAKING_RED_COLORS.accent,
  mutedColor = BREAKING_RED_COLORS.muted,
}: {
  source: string | undefined;
  accentColor?: string;
  mutedColor?: string;
}) {
  if (source === undefined || source.trim().length === 0) {
    return null;
  }

  return (
    <div
      style={{
        alignItems: 'center',
        color: mutedColor,
        display: 'flex',
        fontFamily: BREAKING_RED_FONT_FAMILY,
        fontSize: 22,
        fontWeight: 600,
        gap: 12,
        lineHeight: 1.35,
      }}
    >
      <span
        style={{
          backgroundColor: accentColor,
          borderRadius: 999,
          display: 'block',
          flex: '0 0 auto',
          height: 10,
          width: 10,
        }}
      />
      <span
        style={{
          display: '-webkit-box',
          overflow: 'hidden',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
        }}
      >
        {source}
      </span>
    </div>
  );
}

export function resolveSceneSource(project: ProjectDocumentV1, scene: SceneV1): string | undefined {
  return scene.text.source ?? project.theme.sourceText;
}

export function WarningIcon({ size = 70 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        alignItems: 'center',
        border: `5px solid ${BREAKING_RED_COLORS.accent}`,
        borderRadius: 12,
        color: BREAKING_RED_COLORS.accent,
        display: 'flex',
        fontFamily: BREAKING_RED_FONT_FAMILY,
        fontSize: size * 0.58,
        fontWeight: 900,
        height: size,
        justifyContent: 'center',
        lineHeight: 1,
        transform: 'rotate(45deg)',
        width: size,
      }}
    >
      <span style={{ transform: 'rotate(-45deg)' }}>!</span>
    </div>
  );
}

export function BreakingMediaFrame({
  asset,
  scene,
  style,
}: {
  asset: TemplateAsset;
  scene: SceneV1;
  style?: CSSProperties;
}) {
  const { fps } = useVideoConfig();
  const media = scene.media;

  if (media === undefined) {
    return null;
  }

  const mediaStyle: CSSProperties = {
    height: '100%',
    objectFit: media.fit,
    objectPosition: `${media.positionX * 100}% ${media.positionY * 100}%`,
    transform: `scale(${media.scale})`,
    width: '100%',
  };

  return (
    <div
      style={{
        backgroundColor: BREAKING_RED_COLORS.redDeep,
        border: `4px solid ${BREAKING_RED_COLORS.redBright}`,
        boxShadow: '0 26px 70px rgba(0, 0, 0, 0.46)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {scene.type === 'video' ? (
        <OffthreadVideo
          crossOrigin="anonymous"
          muted={media.muted}
          playbackRate={media.playbackRate}
          src={asset.src}
          startFrom={Math.round((media.startFromMs / 1_000) * fps)}
          style={mediaStyle}
        />
      ) : (
        <Img crossOrigin="anonymous" src={asset.src} style={mediaStyle} />
      )}
    </div>
  );
}

export function resolveSceneAsset(
  scene: SceneV1,
  assets: Record<string, TemplateAsset>,
): TemplateAsset | undefined {
  if (scene.media === undefined) {
    return undefined;
  }

  const asset = assets[scene.media.assetId];

  if (asset === undefined) {
    throw new MissingTemplateAssetError(scene.media.assetId, scene.id);
  }

  return asset;
}

function BreakingLogo({
  project,
  assets,
}: {
  project: ProjectDocumentV1;
  assets: Record<string, TemplateAsset>;
}) {
  const logoAsset =
    project.theme.logoAssetId === undefined ? undefined : assets[project.theme.logoAssetId];

  return (
    <div
      style={{
        alignItems: 'center',
        backgroundColor: project.theme.primaryColor,
        borderRadius: 8,
        color: project.theme.textColor,
        display: 'flex',
        fontFamily: BREAKING_RED_FONT_FAMILY,
        fontSize: 20,
        fontWeight: 900,
        height: 52,
        justifyContent: 'center',
        letterSpacing: '0.08em',
        overflow: 'hidden',
        padding: logoAsset === undefined ? '0 18px' : 0,
        width: logoAsset === undefined ? 'auto' : 52,
      }}
    >
      {logoAsset === undefined ? (
        'LIVE'
      ) : (
        <Img
          crossOrigin="anonymous"
          src={logoAsset.src}
          style={{ height: '100%', objectFit: 'contain', width: '100%' }}
        />
      )}
    </div>
  );
}

export function BreakingSharedLayers({
  project,
  assets,
  durationInFrames,
}: {
  project: ProjectDocumentV1;
  assets: Record<string, TemplateAsset>;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 20 }}>
      <div
        style={{
          alignItems: 'center',
          backgroundColor: BREAKING_RED_COLORS.red,
          display: 'flex',
          gap: 18,
          left: 0,
          padding: '16px 6%',
          position: 'absolute',
          right: 0,
          top: 0,
        }}
      >
        <WarningIcon size={30} />
        <span
          style={{
            color: BREAKING_RED_COLORS.white,
            fontFamily: BREAKING_RED_FONT_FAMILY,
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: '0.16em',
          }}
        >
          BREAKING
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <BreakingLogo assets={assets} project={project} />
        </div>
      </div>
      {project.theme.watermarkText === undefined ? null : (
        <div
          style={{
            color: project.theme.mutedTextColor,
            fontFamily: BREAKING_RED_FONT_FAMILY,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.08em',
            maxWidth: '42%',
            opacity: 0.8,
            overflow: 'hidden',
            position: 'absolute',
            right: '6%',
            textOverflow: 'ellipsis',
            top: '6.4%',
            whiteSpace: 'nowrap',
          }}
        >
          {project.theme.watermarkText}
        </div>
      )}
      <div
        style={{
          backgroundColor: BREAKING_RED_COLORS.rule,
          bottom: '2.7%',
          height: 7,
          left: '6%',
          overflow: 'hidden',
          position: 'absolute',
          right: '6%',
        }}
      >
        <div
          style={{
            backgroundColor: BREAKING_RED_COLORS.accent,
            height: '100%',
            transform: `scaleX(${progress / 100})`,
            transformOrigin: 'left center',
            width: '100%',
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
