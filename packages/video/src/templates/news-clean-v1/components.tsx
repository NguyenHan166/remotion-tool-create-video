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
import { NEWS_CLEAN_COLORS, NEWS_CLEAN_FONT_FAMILY, NEWS_CLEAN_SAFE_AREA } from './tokens.js';

type SafeAreaProps = {
  captionsEnabled: boolean;
  children: ReactNode;
  style?: CSSProperties;
};

export function SafeArea({ captionsEnabled, children, style }: SafeAreaProps) {
  return (
    <AbsoluteFill
      style={{
        boxSizing: 'border-box',
        paddingBottom: captionsEnabled
          ? NEWS_CLEAN_SAFE_AREA.captionBottom
          : NEWS_CLEAN_SAFE_AREA.bottom,
        paddingLeft: NEWS_CLEAN_SAFE_AREA.horizontal,
        paddingRight: NEWS_CLEAN_SAFE_AREA.horizontal,
        paddingTop: NEWS_CLEAN_SAFE_AREA.top,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

type ResponsiveTextProps = {
  text: string | undefined;
  kind: 'display' | 'headline' | 'body';
  align?: SceneV1['style']['textAlign'];
  color?: string;
  maxLines?: number;
  style?: CSSProperties;
};

function getResponsiveFontSize(
  length: number,
  kind: ResponsiveTextProps['kind'],
  width: number,
  height: number,
): number {
  const shortSide = Math.min(width, height);
  const scale = shortSide / 1080;
  const settings = {
    display: { max: 102, min: 50, target: 48 },
    headline: { max: 78, min: 40, target: 72 },
    body: { max: 38, min: 25, target: 230 },
  }[kind];
  const fit = Math.sqrt(settings.target / Math.max(length, settings.target));

  return Math.round(Math.max(settings.min, settings.max * fit) * scale);
}

export function ResponsiveText({
  text,
  kind,
  align = 'left',
  color = NEWS_CLEAN_COLORS.ink,
  maxLines,
  style,
}: ResponsiveTextProps) {
  const { width, height } = useVideoConfig();

  if (text === undefined || text.trim().length === 0) {
    return null;
  }

  const resolvedMaxLines = maxLines ?? (kind === 'body' ? 8 : kind === 'headline' ? 4 : 5);

  return (
    <div
      style={{
        color,
        display: '-webkit-box',
        fontFamily: NEWS_CLEAN_FONT_FAMILY,
        fontSize: getResponsiveFontSize(text.length, kind, width, height),
        fontWeight: kind === 'body' ? 450 : 800,
        letterSpacing: kind === 'display' ? '-0.045em' : '-0.025em',
        lineHeight: kind === 'body' ? 1.48 : 1.08,
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

export function SourceBadge({
  source,
  accentColor = NEWS_CLEAN_COLORS.accent,
  mutedColor = NEWS_CLEAN_COLORS.muted,
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
        fontFamily: NEWS_CLEAN_FONT_FAMILY,
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
          height: 8,
          width: 8,
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

type MediaFrameProps = {
  asset: TemplateAsset;
  scene: SceneV1;
  style?: CSSProperties;
};

export function MediaFrame({ asset, scene, style }: MediaFrameProps) {
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
        backgroundColor: NEWS_CLEAN_COLORS.secondary,
        borderRadius: 30,
        boxShadow: '0 24px 70px rgba(14, 34, 56, 0.14)',
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
          startFrom={Math.round((media.startFromMs / 1000) * fps)}
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

export function LogoMark({
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
        borderRadius: 999,
        color: project.theme.textColor,
        display: 'flex',
        fontFamily: NEWS_CLEAN_FONT_FAMILY,
        fontSize: 22,
        fontWeight: 800,
        height: 54,
        justifyContent: 'center',
        letterSpacing: '0.08em',
        overflow: 'hidden',
        padding: logoAsset === undefined ? '0 22px' : 0,
        width: logoAsset === undefined ? 'auto' : 54,
      }}
    >
      {logoAsset === undefined ? (
        'NEWS'
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

export function SharedLayers({
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
      <div style={{ left: '6%', position: 'absolute', top: '3.2%' }}>
        <LogoMark assets={assets} project={project} />
      </div>
      {project.theme.watermarkText === undefined ? null : (
        <div
          style={{
            color: project.theme.mutedTextColor,
            fontFamily: NEWS_CLEAN_FONT_FAMILY,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '0.08em',
            maxWidth: '42%',
            opacity: 0.78,
            overflow: 'hidden',
            position: 'absolute',
            right: '6%',
            textOverflow: 'ellipsis',
            top: '4%',
            whiteSpace: 'nowrap',
          }}
        >
          {project.theme.watermarkText}
        </div>
      )}
      <div
        style={{
          backgroundColor: NEWS_CLEAN_COLORS.rule,
          bottom: '2.7%',
          height: 5,
          left: '6%',
          overflow: 'hidden',
          position: 'absolute',
          right: '6%',
        }}
      >
        <div
          style={{
            backgroundColor: NEWS_CLEAN_COLORS.accent,
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
