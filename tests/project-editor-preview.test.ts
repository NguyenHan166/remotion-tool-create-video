import { describe, expect, it } from 'vitest';
import {
  createPreviewProps,
  getPreviewScene,
  getResponsivePlayerMaxWidth,
  resolvePreviewAssets,
  updateSceneHeadline,
} from '../apps/web/src/projects/client.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';
import { ProjectVideo } from '../packages/video/src/project-video.js';

describe('project editor preview state', () => {
  it('updates a scene headline immutably and passes the live draft to ProjectVideo', () => {
    const original = structuredClone(STUDIO_PROJECT_FIXTURE);
    const scene = getPreviewScene(original);
    const updated = updateSceneHeadline(original, scene.id, 'Tiêu đề cập nhật trực tiếp');
    const inputProps = createPreviewProps(updated);
    const element = ProjectVideo(inputProps);

    expect(original.scenes[0]!.text.headline).not.toBe('Tiêu đề cập nhật trực tiếp');
    expect(updated.scenes[0]!.text.headline).toBe('Tiêu đề cập nhật trực tiếp');
    expect(updated.scenes[0]).not.toBe(original.scenes[0]);
    expect(element.props.project.scenes[0].text.headline).toBe('Tiêu đề cập nhật trực tiếp');
  });

  it('selects the first enabled scene for the initial preview editor', () => {
    const document = structuredClone(STUDIO_PROJECT_FIXTURE);
    document.scenes[0]!.enabled = false;

    expect(getPreviewScene(document).id).toBe(document.scenes[1]!.id);
  });

  it('resolves logical local asset URLs without filesystem paths', () => {
    const document = structuredClone(STUDIO_PROJECT_FIXTURE);
    const imageAssetId = '11111111-1111-4111-8111-111111111111';
    const videoAssetId = '22222222-2222-4222-8222-222222222222';
    const logoAssetId = '33333333-3333-4333-8333-333333333333';
    const audioAssetId = '44444444-4444-4444-8444-444444444444';
    document.theme.logoAssetId = logoAssetId;
    document.audio.voiceover = {
      assetId: audioAssetId,
      startAtFrame: 0,
      volume: 1,
    };
    document.scenes = [
      {
        ...document.scenes[0]!,
        type: 'image',
        media: {
          assetId: imageAssetId,
          fit: 'cover',
          muted: true,
          playbackRate: 1,
          positionX: 0.5,
          positionY: 0.5,
          scale: 1,
          startFromMs: 0,
        },
      },
      {
        ...document.scenes[1]!,
        type: 'video',
        media: {
          assetId: videoAssetId,
          fit: 'contain',
          muted: true,
          playbackRate: 1,
          positionX: 0.5,
          positionY: 0.5,
          scale: 1,
          startFromMs: 0,
        },
      },
    ];

    expect(resolvePreviewAssets(document)).toEqual({
      [logoAssetId]: {
        id: logoAssetId,
        kind: 'LOGO',
        src: `/api/v1/assets/${logoAssetId}/file`,
      },
      [imageAssetId]: {
        id: imageAssetId,
        kind: 'IMAGE',
        src: `/api/v1/assets/${imageAssetId}/file`,
      },
      [videoAssetId]: {
        id: videoAssetId,
        kind: 'VIDEO',
        src: `/api/v1/assets/${videoAssetId}/file`,
      },
      [audioAssetId]: {
        id: audioAssetId,
        kind: 'AUDIO',
        src: `/api/v1/assets/${audioAssetId}/file`,
      },
    });
  });

  it('caps vertical and landscape players by composition-relative height', () => {
    expect(getResponsivePlayerMaxWidth(1080, 1920)).toBe(473);
    expect(getResponsivePlayerMaxWidth(1920, 1080)).toBe(1493);
    expect(getResponsivePlayerMaxWidth(1080, 1080)).toBe(840);
  });
});
