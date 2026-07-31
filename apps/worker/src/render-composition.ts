import {
  computeProjectContentHash,
  type AssetKind,
  type RenderRevisionAssetRecord,
  type RenderRevisionSnapshotRecord,
} from '@hansys/database';
import {
  extractProjectAssetIds,
  migrateProjectDocument,
  type ProjectDocumentV1,
} from '@hansys/project-schema';
import {
  getTemplate,
  templateRegistry,
  type TemplateAsset,
  type TemplateRegistry,
  type TemplateValidationIssue,
} from '@hansys/template-registry';
import { PROJECT_VIDEO_COMPOSITION_ID } from '@hansys/video/composition';
import type { SelectCompositionOptions, selectComposition } from '@remotion/renderer';
import type { WorkerAssetScope, WorkerServedAsset } from './asset-server.js';

export type RenderJobIdentity = {
  id: string;
  projectId: string;
  revisionId: string;
};

export type ImmutableRevisionAsset = RenderRevisionAssetRecord;
export type ImmutableRenderRevision = Omit<RenderRevisionSnapshotRecord, 'assets'> & {
  assets: readonly ImmutableRevisionAsset[];
};

export type RenderInputProps = Record<string, unknown> & {
  project: ProjectDocumentV1;
  assets: Readonly<Record<string, TemplateAsset>>;
};

export type SelectedComposition = Awaited<ReturnType<typeof selectComposition>>;
export type RenderPreparationStage = 'BUNDLING' | 'RENDERING';

export type SelectedRenderComposition = {
  revision: ImmutableRenderRevision;
  inputProps: RenderInputProps;
  bundleKey: string;
  serveUrl: string;
  composition: SelectedComposition;
  templateWarnings: readonly TemplateValidationIssue[];
  close(): Promise<void>;
};

export type SelectCompositionFromRevisionOptions = {
  job: RenderJobIdentity;
  loadRevision: (revisionId: string) => Promise<ImmutableRenderRevision | null>;
  verifyAsset: (asset: ImmutableRevisionAsset) => Promise<void>;
  createAssetScope: (assets: readonly WorkerServedAsset[]) => Promise<WorkerAssetScope>;
  getBundle: () => Promise<{ bundleKey: string; serveUrl: string }>;
  select: (options: SelectCompositionOptions) => Promise<SelectedComposition>;
  onStage?: (stage: RenderPreparationStage) => Promise<void>;
  registry?: TemplateRegistry;
};

export class ImmutableRenderRevisionError extends Error {
  readonly code = 'RENDER_REVISION_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'ImmutableRenderRevisionError';
  }
}

export class RenderRevisionNotFoundError extends Error {
  readonly code = 'RENDER_REVISION_NOT_FOUND';
  readonly revisionId: string;

  constructor(revisionId: string) {
    super('The immutable render revision was not found.');
    this.name = 'RenderRevisionNotFoundError';
    this.revisionId = revisionId;
  }
}

export class RenderRevisionAssetError extends Error {
  readonly code = 'RENDER_REVISION_ASSET_INVALID';
  readonly assetIds: readonly string[];

  constructor(message: string, assetIds: readonly string[]) {
    super(message);
    this.name = 'RenderRevisionAssetError';
    this.assetIds = assetIds;
  }
}

export class RenderRevisionTemplateError extends Error {
  readonly code = 'PROJECT_VALIDATION_FAILED';
  readonly details: readonly TemplateValidationIssue[];

  constructor(details: readonly TemplateValidationIssue[]) {
    super('The immutable revision is incompatible with its template.');
    this.name = 'RenderRevisionTemplateError';
    this.details = details;
  }
}

export class CompositionMetadataMismatchError extends Error {
  readonly code = 'COMPOSITION_METADATA_MISMATCH';

  constructor(message: string) {
    super(message);
    this.name = 'CompositionMetadataMismatchError';
  }
}

function getExpectedAssetKind(project: ProjectDocumentV1, assetId: string): TemplateAsset['kind'] {
  if (project.theme.logoAssetId === assetId) {
    return 'LOGO';
  }

  if (
    project.audio.voiceover?.assetId === assetId ||
    project.audio.backgroundMusic?.assetId === assetId
  ) {
    return 'AUDIO';
  }

  const scene = project.scenes.find((candidate) => candidate.media?.assetId === assetId);
  return scene?.type === 'video' ? 'VIDEO' : 'IMAGE';
}

function isCompatibleAssetKind(actual: AssetKind, expected: TemplateAsset['kind']): boolean {
  return expected === 'LOGO' ? actual === 'LOGO' || actual === 'IMAGE' : actual === expected;
}

function toOptionalSafeNumber(
  value: bigint | null,
  field: string,
  assetId: string,
): number | undefined {
  if (value === null) {
    return undefined;
  }

  const numberValue = Number(value);

  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new RenderRevisionAssetError(`Asset ${assetId} has an invalid ${field} value.`, [
      assetId,
    ]);
  }

  return numberValue;
}

function assertRevisionMatchesJob(
  job: RenderJobIdentity,
  revision: ImmutableRenderRevision,
  project: ProjectDocumentV1,
): void {
  if (revision.id !== job.revisionId || revision.projectId !== job.projectId) {
    throw new ImmutableRenderRevisionError(
      'The revision does not belong to the claimed render job.',
    );
  }

  if (
    revision.schemaVersion !== project.schemaVersion ||
    revision.templateId !== project.template.id ||
    revision.templateVersion !== project.template.version
  ) {
    throw new ImmutableRenderRevisionError(
      'The revision metadata does not match its project document snapshot.',
    );
  }

  if (computeProjectContentHash(project) !== revision.contentHash) {
    throw new ImmutableRenderRevisionError(
      'The revision content hash does not match its snapshot.',
    );
  }
}

async function buildRenderInputProps(
  project: ProjectDocumentV1,
  revisionAssets: readonly ImmutableRevisionAsset[],
  verifyAsset: SelectCompositionFromRevisionOptions['verifyAsset'],
  assetScope: WorkerAssetScope,
): Promise<RenderInputProps> {
  const referencedAssetIds = extractProjectAssetIds(project).sort();
  const revisionAssetIds = revisionAssets.map(({ id }) => id).sort();

  if (
    referencedAssetIds.length !== revisionAssetIds.length ||
    referencedAssetIds.some((assetId, index) => assetId !== revisionAssetIds[index])
  ) {
    throw new RenderRevisionAssetError(
      'Revision asset bindings do not match the project document snapshot.',
      [...new Set([...referencedAssetIds, ...revisionAssetIds])],
    );
  }

  const assets: Record<string, TemplateAsset> = {};

  for (const asset of revisionAssets) {
    if (asset.status !== 'READY') {
      throw new RenderRevisionAssetError(`Asset ${asset.id} is not ready for rendering.`, [
        asset.id,
      ]);
    }

    const expectedKind = getExpectedAssetKind(project, asset.id);

    if (!isCompatibleAssetKind(asset.kind, expectedKind)) {
      throw new RenderRevisionAssetError(
        `Asset ${asset.id} has kind ${asset.kind}, but the revision uses it as ${expectedKind}.`,
        [asset.id],
      );
    }

    await verifyAsset(asset);
    const durationMs = toOptionalSafeNumber(asset.durationMs, 'duration', asset.id);
    assets[asset.id] = {
      id: asset.id,
      kind: expectedKind,
      src: assetScope.sourceUrl(asset.id),
      ...(asset.width === null ? {} : { width: asset.width }),
      ...(asset.height === null ? {} : { height: asset.height }),
      ...(durationMs === undefined ? {} : { durationMs }),
    };
  }

  return Object.freeze({
    project,
    assets: Object.freeze(assets),
  });
}

function assertCompositionMatchesRevision(
  composition: SelectedComposition,
  project: ProjectDocumentV1,
): void {
  const expectedDuration = project.scenes
    .filter(({ enabled }) => enabled)
    .reduce((total, { durationInFrames }) => total + durationInFrames, 0);

  if (composition.id !== PROJECT_VIDEO_COMPOSITION_ID) {
    throw new CompositionMetadataMismatchError(
      `Selected composition ID ${composition.id} does not match ${PROJECT_VIDEO_COMPOSITION_ID}.`,
    );
  }

  if (
    composition.width !== project.composition.width ||
    composition.height !== project.composition.height ||
    composition.fps !== project.composition.fps ||
    composition.durationInFrames !== expectedDuration
  ) {
    throw new CompositionMetadataMismatchError(
      'Selected composition size, FPS or duration does not match the immutable revision.',
    );
  }
}

export async function selectCompositionFromRevision({
  job,
  loadRevision,
  verifyAsset,
  createAssetScope,
  getBundle,
  select,
  onStage = async () => undefined,
  registry = templateRegistry,
}: SelectCompositionFromRevisionOptions): Promise<SelectedRenderComposition> {
  const revision = await loadRevision(job.revisionId);

  if (revision === null) {
    throw new RenderRevisionNotFoundError(job.revisionId);
  }

  const project = migrateProjectDocument(revision.document);
  assertRevisionMatchesJob(job, revision, project);
  const template = getTemplate(project.template.id, project.template.version, registry);
  const templateValidation = template.validate(project);

  if (templateValidation.errors.length > 0) {
    throw new RenderRevisionTemplateError(templateValidation.errors);
  }

  const assetScope = await createAssetScope(revision.assets);

  try {
    const inputProps = await buildRenderInputProps(
      project,
      revision.assets,
      verifyAsset,
      assetScope,
    );
    await onStage('BUNDLING');
    const { bundleKey, serveUrl } = await getBundle();
    await onStage('RENDERING');
    const composition = await select({
      serveUrl,
      id: PROJECT_VIDEO_COMPOSITION_ID,
      inputProps,
    });
    assertCompositionMatchesRevision(composition, project);

    return {
      revision,
      inputProps,
      bundleKey,
      serveUrl,
      composition,
      templateWarnings: templateValidation.warnings,
      close: assetScope.close,
    };
  } catch (error) {
    await assetScope.close();
    throw error;
  }
}
