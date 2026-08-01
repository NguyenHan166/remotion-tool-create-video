import { describe, expect, it } from 'vitest';
import { setProjectVoiceover } from '../apps/web/src/projects/audio.js';
import {
  getVoiceoverLayerConfig,
  MissingVoiceoverAssetError,
} from '../packages/video/src/templates/news-clean-v1/index.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';

const voiceoverAssetId = '11111111-1111-4111-8111-111111111111';

describe('voiceover track', () => {
  it('updates only the voiceover while preserving the remaining audio configuration', () => {
    const project = structuredClone(STUDIO_PROJECT_FIXTURE);
    project.audio.backgroundMusic = {
      assetId: '22222222-2222-4222-8222-222222222222',
      fadeInFrames: 10,
      fadeOutFrames: 10,
      loop: true,
      startAtFrame: 5,
      volume: 0.25,
    };

    const withVoiceover = setProjectVoiceover(project, {
      assetId: voiceoverAssetId,
      startAtFrame: 24,
      volume: 0.65,
    });

    expect(withVoiceover.audio).toEqual({
      backgroundMusic: project.audio.backgroundMusic,
      voiceover: {
        assetId: voiceoverAssetId,
        startAtFrame: 24,
        volume: 0.65,
      },
    });
    expect(setProjectVoiceover(withVoiceover, undefined).audio).toEqual({
      backgroundMusic: project.audio.backgroundMusic,
    });
  });

  it('maps a selected audio asset to the same Remotion configuration for preview and render', () => {
    const project = setProjectVoiceover(STUDIO_PROJECT_FIXTURE, {
      assetId: voiceoverAssetId,
      startAtFrame: 18,
      volume: 0.7,
    });

    expect(
      getVoiceoverLayerConfig(project, {
        [voiceoverAssetId]: {
          id: voiceoverAssetId,
          kind: 'AUDIO',
          src: 'http://127.0.0.1/audio/voiceover.wav',
        },
      }),
    ).toEqual({
      src: 'http://127.0.0.1/audio/voiceover.wav',
      startAtFrame: 18,
      volume: 0.7,
    });
  });

  it('fails explicitly when a selected voiceover asset is unavailable to the composition', () => {
    const project = setProjectVoiceover(STUDIO_PROJECT_FIXTURE, {
      assetId: voiceoverAssetId,
      startAtFrame: 0,
      volume: 1,
    });

    expect(() => getVoiceoverLayerConfig(project, {})).toThrow(MissingVoiceoverAssetError);
  });
});
