import { describe, expect, it } from 'vitest';
import { setProjectBackgroundMusic } from '../apps/web/src/projects/audio.js';
import {
  getBackgroundMusicLayerConfig,
  getBackgroundMusicVolume,
  MissingBackgroundMusicAssetError,
} from '../packages/video/src/templates/news-clean-v1/index.js';
import {
  validateProjectDocument,
  type ProjectDocumentV1,
} from '../packages/project-schema/src/index.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';

const musicAssetId = '11111111-1111-4111-8111-111111111111';

function withBackgroundMusic(project: ProjectDocumentV1) {
  return setProjectBackgroundMusic(project, {
    assetId: musicAssetId,
    fadeInFrames: 20,
    fadeOutFrames: 30,
    loop: true,
    startAtFrame: 10,
    volume: 0.5,
  });
}

describe('background music', () => {
  it('preserves the voiceover while setting or removing background music', () => {
    const project = structuredClone(STUDIO_PROJECT_FIXTURE);
    project.audio.voiceover = {
      assetId: '22222222-2222-4222-8222-222222222222',
      startAtFrame: 4,
      volume: 0.8,
    };

    const withMusic = withBackgroundMusic(project);

    expect(withMusic.audio).toMatchObject({
      backgroundMusic: expect.objectContaining({ assetId: musicAssetId }),
      voiceover: project.audio.voiceover,
    });
    expect(setProjectBackgroundMusic(withMusic, undefined).audio).toEqual({
      voiceover: project.audio.voiceover,
    });
  });

  it('uses loop, offset and deterministic fade volumes in the shared Remotion layer', () => {
    const project = withBackgroundMusic(STUDIO_PROJECT_FIXTURE);
    const config = getBackgroundMusicLayerConfig(
      project,
      {
        [musicAssetId]: {
          id: musicAssetId,
          kind: 'AUDIO',
          src: 'http://127.0.0.1/audio/music.wav',
        },
      },
      210,
    );

    expect(config).toMatchObject({
      durationInFrames: 200,
      fadeInFrames: 20,
      fadeOutFrames: 30,
      loop: true,
      startAtFrame: 10,
      volume: 0.5,
    });
    expect(getBackgroundMusicVolume(config!, 0)).toBe(0);
    expect(getBackgroundMusicVolume(config!, 10)).toBe(0.25);
    expect(getBackgroundMusicVolume(config!, 20)).toBe(0.5);
    expect(getBackgroundMusicVolume(config!, 190)).toBeCloseTo(1 / 6);
  });

  it('rejects combined fades beyond the playable project duration with a field path', () => {
    const project = withBackgroundMusic(STUDIO_PROJECT_FIXTURE);
    project.audio.backgroundMusic = {
      ...project.audio.backgroundMusic!,
      fadeInFrames: 100,
      fadeOutFrames: 101,
    };

    const result = validateProjectDocument(project);

    expect(result).toMatchObject({
      success: false,
      details: [
        expect.objectContaining({
          path: 'audio.backgroundMusic.fadeOutFrames',
          message: 'Combined background music fades must not exceed its available duration',
        }),
      ],
    });
  });

  it('fails explicitly when the selected music asset is unavailable', () => {
    const project = withBackgroundMusic(STUDIO_PROJECT_FIXTURE);

    expect(() => getBackgroundMusicLayerConfig(project, {}, 210)).toThrow(
      MissingBackgroundMusicAssetError,
    );
  });
});
