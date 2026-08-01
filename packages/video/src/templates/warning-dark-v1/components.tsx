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
import { WARNING_DARK_COLORS, WARNING_DARK_FONT_FAMILY, WARNING_DARK_SAFE_AREA } from './tokens.js';

type SafeAreaProps = {
  captionsEnabled: boolean;
  children: ReactNode;
  style?: CSSProperties;
};

export function WarningSafeArea({ captionsEnabled, children, style }: SafeAreaProps) {
  return (
    <AbsoluteFill
      style={{
        boxSizing: 'border-box',
        paddingBottom: captionsEnabled
          ? WARNING_DARK_SAFE_AREA.captionBottom
          : WARNING_DARK_SAFE_AREA.bottom,
        paddingLeft: WARNING_DARK_SAFE_AREA.horizontal,
        paddingRight: WARNING_DARK_SAFE_AREA.horizontal,
        paddingTop: WARNING_DARK_SAFE_AREA.top,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

export type WarningTextKind = 'display' | 'headline' | 'body';

export function getWarningHeadlineFontSize(
  textLength: number,
  width: number,
  height: number,
): number {
  const shortSide = Math.min(width, height);
  const scale = shortSide / 1_080;
  const fit = Math.sqrt(72 / Math.max(textLength, 72));

  return Math.round(Math.max(34, Math.min(96, 96 * fit)) * scale);
}

function getWarningFontSize(
  textLength: number,
  kind: WarningTextKind,
  width: number,
  height: number,
): number {
  if (kind === 'display') {
    return getWarningHeadlineFontSize(textLength, width, height);
  }

  const shortSide = Math.min(width, height);
  const scale = shortSide / 1_080;
  const settings = {
    headline: { max: 68, min: 31, target: 112 },
    body: { max: 37, min: 23, target: 230 },
  }[kind];
  const fit = Math.sqrt(settings.target / Math.max(textLength, settings.target));

  return Math.round(Math.max(settings.min, settings.max * fit) * scale);
}

export function WarningText({
  text,
  kind,
  align = 'left',
  color = WARNING_DARK_COLORS.white,
  maxLines,
  style,
}: {
  text: string | undefined;
  kind: WarningTextKind;
  align?: SceneV1['style']['textAlign'];
  color?: string;
  maxLines?: number;
  style?: CSSProperties;
}) {
  const { width, height } = useVideoConfig();

  if (text === undefined || text.trim().length === 0) {
    return null;
  }

  const resolvedMaxLines = maxLines ?? (kind === 'body' ? 8 : kind === 'headline' ? 5 : 6);

  return (
    <div
      style={{
        color,
        display: '-webkit-box',
        fontFamily: WARNING_DARK_FONT_FAMILY,
        fontSize: getWarningFontSize(text.length, kind, width, height),
        fontWeight: kind === 'body' ? 450 : 800,
        letterSpacing: kind === 'display' ? '-0.04em' : '-0.025em',
        lineHeight: kind === 'body' ? 1.45 : 1.1,
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

export function WarningSourceBadge({ source }: { source: string | undefined }) {
  if (source === undefined || source.trim().length === 0) {
    return null;
  }

  return (
    <div
      style={{
        alignItems: 'center',
        color: WARNING_DARK_COLORS.muted,
        display: 'flex',
        fontFamily: WARNING_DARK_FONT_FAMILY,
        fontSize: 21,
        fontWeight: 600,
        gap: 12,
        lineHeight: 1.35,
      }}
    >
      <span
        style={{
          backgroundColor: WARNING_DARK_COLORS.yellow,
          borderRadius: 999,
          display: 'block',
          flex: '0 0 auto',
          height: 9,
          width: 9,
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

export function WarningIcon({ size = 80 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        alignItems: 'center',
        backgroundColor: WARNING_DARK_COLORS.yellow,
        clipPath: 'polygon(50% 0, 100% 100%, 0 100%)',
        color: WARNING_DARK_COLORS.ink,
        display: 'flex',
        fontFamily: WARNING_DARK_FONT_FAMILY,
        fontSize: size * 0.47,
        fontWeight: 900,
        height: size,
        justifyContent: 'center',
        lineHeight: 1,
        paddingTop: size * 0.14,
        width: size,
      }}
    >
      !
    </div>
  );
}

export function WarningMediaFrame({
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
        backgroundColor: WARNING_DARK_COLORS.panel,
        border: `3px solid ${WARNING_DARK_COLORS.yellow}`,
        boxShadow: '0 24px 70px rgba(0, 0, 0, 0.5)',
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

function WarningLogo({
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
        backgroundColor: WARNING_DARK_COLORS.panelRaised,
        border: `1px solid ${WARNING_DARK_COLORS.rule}`,
        borderRadius: 8,
        color: WARNING_DARK_COLORS.white,
        display: 'flex',
        fontFamily: WARNING_DARK_FONT_FAMILY,
        fontSize: 19,
        fontWeight: 800,
        height: 48,
        justifyContent: 'center',
        letterSpacing: '0.08em',
        overflow: 'hidden',
        padding: logoAsset === undefined ? '0 16px' : 0,
        width: logoAsset === undefined ? 'auto' : 48,
      }}
    >
      {logoAsset === undefined ? (
        'ALERT'
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

export function WarningSharedLayers({
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
          backgroundColor: WARNING_DARK_COLORS.panel,
          borderBottom: `4px solid ${WARNING_DARK_COLORS.red}`,
          display: 'flex',
          gap: 16,
          left: 0,
          padding: '14px 6%',
          position: 'absolute',
          right: 0,
          top: 0,
        }}
      >
        <WarningIcon size={32} />
        <span
          style={{
            color: WARNING_DARK_COLORS.yellow,
            fontFamily: WARNING_DARK_FONT_FAMILY,
            fontSize: 21,
            fontWeight: 900,
            letterSpacing: '0.13em',
          }}
        >
          CẢNH BÁO
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <WarningLogo assets={assets} project={project} />
        </div>
      </div>
      {project.theme.watermarkText === undefined ? null : (
        <div
          style={{
            color: WARNING_DARK_COLORS.muted,
            fontFamily: WARNING_DARK_FONT_FAMILY,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: '0.08em',
            maxWidth: '42%',
            opacity: 0.8,
            overflow: 'hidden',
            position: 'absolute',
            right: '6%',
            textOverflow: 'ellipsis',
            top: '6.5%',
            whiteSpace: 'nowrap',
          }}
        >
          {project.theme.watermarkText}
        </div>
      )}
      <div
        style={{
          backgroundColor: WARNING_DARK_COLORS.rule,
          bottom: '2.7%',
          height: 6,
          left: '6%',
          overflow: 'hidden',
          position: 'absolute',
          right: '6%',
        }}
      >
        <div
          style={{
            backgroundColor: WARNING_DARK_COLORS.yellow,
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
