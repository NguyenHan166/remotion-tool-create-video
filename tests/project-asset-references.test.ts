import { describe, expect, it, vi } from 'vitest';
import {
  AssetNotFoundError,
  synchronizeProjectAssetReferences,
} from '../packages/database/src/index.js';
import {
  extractProjectAssetIds,
  parseProjectDocument,
} from '../packages/project-schema/src/index.js';

const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const logoAssetId = '11111111-1111-4111-8111-111111111111';
const mediaAssetId = '22222222-2222-4222-8222-222222222222';
const audioAssetId = '33333333-3333-4333-8333-333333333333';

function createDocumentWithAssets() {
  return parseProjectDocument({
    schemaVersion: 1,
    metadata: {
      title: 'Asset references',
    },
    template: {
      id: 'warning-dark-v1',
    },
    theme: {
      logoAssetId,
    },
    scenes: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        type: 'image',
        name: 'Image',
        media: {
          assetId: mediaAssetId,
          fit: 'cover',
          positionX: 0.5,
          positionY: 0.5,
          scale: 1,
          startFromMs: 0,
          playbackRate: 1,
          muted: true,
        },
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        type: 'outro',
        name: 'Outro',
        media: {
          assetId: logoAssetId,
          fit: 'contain',
          positionX: 0.5,
          positionY: 0.5,
          scale: 1,
          startFromMs: 0,
          playbackRate: 1,
          muted: true,
        },
      },
    ],
    audio: {
      voiceover: {
        assetId: audioAssetId,
        volume: 1,
        startAtFrame: 0,
      },
      backgroundMusic: {
        assetId: mediaAssetId,
        volume: 0.5,
        startAtFrame: 0,
        loop: true,
        fadeInFrames: 10,
        fadeOutFrames: 10,
      },
    },
  });
}

describe('project asset references', () => {
  it('extracts unique IDs from theme, scene media and audio in stable order', () => {
    expect(extractProjectAssetIds(createDocumentWithAssets())).toEqual([
      logoAssetId,
      mediaAssetId,
      audioAssetId,
    ]);
  });

  it('removes stale links and creates each current link once', async () => {
    const findMany = vi.fn(async () => [{ id: logoAssetId }, { id: mediaAssetId }]);
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const createMany = vi.fn(async () => ({ count: 2 }));

    await synchronizeProjectAssetReferences(
      {
        asset: {
          findMany,
        },
        projectAsset: {
          deleteMany,
          createMany,
        },
      },
      projectId,
      [logoAssetId, mediaAssetId, logoAssetId],
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: [logoAssetId, mediaAssetId],
        },
        status: {
          not: 'DELETED',
        },
      },
      select: {
        id: true,
      },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        projectId,
        assetId: {
          notIn: [logoAssetId, mediaAssetId],
        },
      },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          projectId,
          assetId: logoAssetId,
        },
        {
          projectId,
          assetId: mediaAssetId,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('removes every link when the document has no assets', async () => {
    const findMany = vi.fn(async () => []);
    const deleteMany = vi.fn(async () => ({ count: 2 }));
    const createMany = vi.fn(async () => ({ count: 0 }));

    await synchronizeProjectAssetReferences(
      {
        asset: {
          findMany,
        },
        projectAsset: {
          deleteMany,
          createMany,
        },
      },
      projectId,
      [],
    );

    expect(findMany).not.toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        projectId,
      },
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rejects missing or deleted assets before changing links', async () => {
    const findMany = vi.fn(async () => [{ id: logoAssetId }]);
    const deleteMany = vi.fn(async () => ({ count: 0 }));
    const createMany = vi.fn(async () => ({ count: 0 }));
    const synchronization = synchronizeProjectAssetReferences(
      {
        asset: {
          findMany,
        },
        projectAsset: {
          deleteMany,
          createMany,
        },
      },
      projectId,
      [logoAssetId, audioAssetId],
    );

    await expect(synchronization).rejects.toBeInstanceOf(AssetNotFoundError);
    await expect(synchronization).rejects.toMatchObject({
      code: 'ASSET_NOT_FOUND',
      assetIds: [audioAssetId],
    });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});
