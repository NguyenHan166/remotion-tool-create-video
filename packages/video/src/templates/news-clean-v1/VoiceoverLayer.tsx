import { type ProjectDocumentV1 } from '@hansys/project-schema';
import { type TemplateAsset } from '@hansys/template-registry';
import { Audio, Sequence } from 'remotion';
import { MissingVoiceoverAssetError } from './errors.js';

export type VoiceoverLayerConfig = Readonly<{
  src: string;
  startAtFrame: number;
  volume: number;
}>;

export function getVoiceoverLayerConfig(
  project: ProjectDocumentV1,
  assets: Record<string, TemplateAsset>,
): VoiceoverLayerConfig | undefined {
  const voiceover = project.audio.voiceover;

  if (voiceover === undefined) {
    return undefined;
  }

  const asset = assets[voiceover.assetId];

  if (asset === undefined) {
    throw new MissingVoiceoverAssetError(voiceover.assetId);
  }

  if (asset.kind !== 'AUDIO') {
    throw new TypeError(`Voiceover asset "${asset.id}" must have kind AUDIO.`);
  }

  return {
    src: asset.src,
    startAtFrame: voiceover.startAtFrame,
    volume: voiceover.volume,
  };
}

export function VoiceoverLayer({
  project,
  assets,
}: {
  project: ProjectDocumentV1;
  assets: Record<string, TemplateAsset>;
}) {
  const config = getVoiceoverLayerConfig(project, assets);

  if (config === undefined) {
    return null;
  }

  return (
    <Sequence from={config.startAtFrame} layout="none" name="Voiceover">
      <Audio src={config.src} volume={config.volume} />
    </Sequence>
  );
}
