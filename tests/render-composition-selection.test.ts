import { describe, expect, it, vi } from 'vitest';
import {
  CompositionMetadataMismatchError,
  RenderRevisionAssetError,
  selectCompositionFromRevision,
  type ImmutableRenderRevision,
  type SelectedComposition,
} from '../apps/worker/src/render-composition.js';
import { computeProjectContentHash } from '../packages/database/src/index.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';
import { PROJECT_VIDEO_COMPOSITION_ID } from '../packages/video/src/composition.js';

const job = {
  id: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  revisionId: '33333333-3333-4333-8333-333333333333',
};
const logoAssetId = '44444444-4444-4444-8444-444444444444';

function createRevision(): ImmutableRenderRevision {
  const document = structuredClone(STUDIO_PROJECT_FIXTURE);
  document.metadata.title = 'Immutable revision title';
  document.composition = {
    ...document.composition,
    width: 720,
    height: 1280,
    fps: 25,
  };
  document.theme.logoAssetId = logoAssetId;
  document.scenes = [
    { ...document.scenes[0]!, durationInFrames: 75 },
    { ...document.scenes[1]!, enabled: false, durationInFrames: 500 },
  ];

  return {
    id: job.revisionId,
    projectId: job.projectId,
    schemaVersion: document.schemaVersion,
    templateId: document.template.id,
    templateVersion: document.template.version,
    contentHash: computeProjectContentHash(document),
    document,
    assets: [
      {
        id: logoAssetId,
        kind: 'IMAGE',
        status: 'READY',
        relativePath: `assets/${logoAssetId}.png`,
        mimeType: 'image/png',
        width: 800,
        height: 400,
        durationMs: null,
      },
    ],
  };
}

function createSelectedComposition(
  overrides: Partial<
    Pick<SelectedComposition, 'id' | 'width' | 'height' | 'fps' | 'durationInFrames'>
  > = {},
): SelectedComposition {
  return {
    id: PROJECT_VIDEO_COMPOSITION_ID,
    width: 720,
    height: 1280,
    fps: 25,
    durationInFrames: 75,
    ...overrides,
  } as SelectedComposition;
}

describe('composition selection from immutable revision', () => {
  it('uses revision props for dynamic duration and size even after the draft changes', async () => {
    const revision = createRevision();
    const currentDraft = structuredClone(revision.document as typeof STUDIO_PROJECT_FIXTURE);
    currentDraft.metadata.title = 'Changed draft title';
    currentDraft.composition.width = 1080;
    currentDraft.composition.height = 1920;
    currentDraft.scenes[0]!.durationInFrames = 300;
    const loadRevision = vi.fn().mockResolvedValue(revision);
    const verifyAsset = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const stages: string[] = [];
    let selectedInputProps: Record<string, unknown> | undefined;

    const prepared = await selectCompositionFromRevision({
      job,
      loadRevision,
      verifyAsset,
      createAssetScope: async () => ({
        sourceUrl: (assetId) => `http://127.0.0.1/revision/${assetId}`,
        close,
      }),
      getBundle: async () => ({ bundleKey: 'a'.repeat(64), serveUrl: '/bundle/a' }),
      select: async (options) => {
        selectedInputProps = options.inputProps;
        return createSelectedComposition();
      },
      onStage: async (stage) => {
        stages.push(stage);
      },
    });

    expect(loadRevision).toHaveBeenCalledWith(job.revisionId);
    expect(prepared.inputProps).toBe(selectedInputProps);
    expect(prepared.inputProps.project.metadata.title).toBe('Immutable revision title');
    expect(prepared.inputProps.project.composition).toMatchObject({
      width: 720,
      height: 1280,
      fps: 25,
    });
    expect(prepared.composition).toMatchObject({
      width: 720,
      height: 1280,
      fps: 25,
      durationInFrames: 75,
    });
    expect(prepared.inputProps.assets[logoAssetId]).toEqual({
      id: logoAssetId,
      kind: 'LOGO',
      src: `http://127.0.0.1/revision/${logoAssetId}`,
      width: 800,
      height: 400,
    });
    expect(verifyAsset).toHaveBeenCalledWith(revision.assets[0]);
    expect(stages).toEqual(['BUNDLING', 'RENDERING']);
    expect(currentDraft.metadata.title).toBe('Changed draft title');
    expect(close).not.toHaveBeenCalled();

    await prepared.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects revision asset bindings that differ from the document snapshot', async () => {
    const revision = createRevision();
    revision.assets = [];
    const close = vi.fn().mockResolvedValue(undefined);

    await expect(
      selectCompositionFromRevision({
        job,
        loadRevision: async () => revision,
        verifyAsset: vi.fn(),
        createAssetScope: async () => ({ sourceUrl: vi.fn(), close }),
        getBundle: vi.fn(),
        select: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(RenderRevisionAssetError);
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the asset scope when selected metadata differs from the revision', async () => {
    const revision = createRevision();
    const close = vi.fn().mockResolvedValue(undefined);

    await expect(
      selectCompositionFromRevision({
        job,
        loadRevision: async () => revision,
        verifyAsset: async () => undefined,
        createAssetScope: async () => ({
          sourceUrl: (assetId) => `http://127.0.0.1/revision/${assetId}`,
          close,
        }),
        getBundle: async () => ({ bundleKey: 'a'.repeat(64), serveUrl: '/bundle/a' }),
        select: async () => createSelectedComposition({ durationInFrames: 76 }),
      }),
    ).rejects.toBeInstanceOf(CompositionMetadataMismatchError);
    expect(close).toHaveBeenCalledOnce();
  });
});
