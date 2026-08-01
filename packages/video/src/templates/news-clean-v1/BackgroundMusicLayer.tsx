import { type ProjectDocumentV1 } from '@hansys/project-schema';
import { type TemplateAsset } from '@hansys/template-registry';
import { Audio, Sequence } from 'remotion';
import { MissingBackgroundMusicAssetError } from './errors.js';

export type BackgroundMusicLayerConfig = Readonly<{
  durationInFrames: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  loop: boolean;
  src: string;
  startAtFrame: number;
  volume: number;
}>;

export function getBackgroundMusicLayerConfig(
  project: ProjectDocumentV1,
  assets: Record<string, TemplateAsset>,
  totalDurationInFrames: number,
): BackgroundMusicLayerConfig | undefined {
  const backgroundMusic = project.audio.backgroundMusic;

  if (backgroundMusic === undefined) {
    return undefined;
  }

  const asset = assets[backgroundMusic.assetId];

  if (asset === undefined) {
    throw new MissingBackgroundMusicAssetError(backgroundMusic.assetId);
  }

  if (asset.kind !== 'AUDIO') {
    throw new TypeError(`Background music asset "${asset.id}" must have kind AUDIO.`);
  }

  const durationInFrames = totalDurationInFrames - backgroundMusic.startAtFrame;

  if (durationInFrames <= 0) {
    throw new RangeError('Background music must start before the project ends.');
  }

  if (backgroundMusic.fadeInFrames + backgroundMusic.fadeOutFrames > durationInFrames) {
    throw new RangeError('Combined background music fades must not exceed its available duration.');
  }

  return {
    durationInFrames,
    fadeInFrames: backgroundMusic.fadeInFrames,
    fadeOutFrames: backgroundMusic.fadeOutFrames,
    loop: backgroundMusic.loop,
    src: asset.src,
    startAtFrame: backgroundMusic.startAtFrame,
    volume: backgroundMusic.volume,
  };
}

export function getBackgroundMusicVolume(
  config: BackgroundMusicLayerConfig,
  frame: number,
): number {
  const fadeInMultiplier =
    config.fadeInFrames === 0 ? 1 : Math.min(1, Math.max(0, frame / config.fadeInFrames));
  const remainingFrames = config.durationInFrames - frame;
  const fadeOutMultiplier =
    config.fadeOutFrames === 0
      ? 1
      : Math.min(1, Math.max(0, remainingFrames / config.fadeOutFrames));

  return config.volume * Math.min(fadeInMultiplier, fadeOutMultiplier);
}

export function BackgroundMusicLayer({
  project,
  assets,
  durationInFrames,
}: {
  project: ProjectDocumentV1;
  assets: Record<string, TemplateAsset>;
  durationInFrames: number;
}) {
  const config = getBackgroundMusicLayerConfig(project, assets, durationInFrames);

  if (config === undefined) {
    return null;
  }

  return (
    <Sequence
      durationInFrames={config.durationInFrames}
      from={config.startAtFrame}
      layout="none"
      name="Background music"
    >
      <Audio
        loop={config.loop}
        src={config.src}
        volume={(frame) => getBackgroundMusicVolume(config, frame)}
      />
    </Sequence>
  );
}
