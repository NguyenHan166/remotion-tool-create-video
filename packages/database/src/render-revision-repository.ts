import type { AssetKind, AssetStatus, PrismaClient } from '../generated/prisma/client.js';

export type RenderRevisionAssetRecord = {
  id: string;
  kind: AssetKind;
  status: AssetStatus;
  relativePath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationMs: bigint | null;
};

export type RenderRevisionSnapshotRecord = {
  id: string;
  projectId: string;
  schemaVersion: number;
  templateId: string;
  templateVersion: number;
  contentHash: string;
  document: unknown;
  assets: RenderRevisionAssetRecord[];
};

export interface RenderRevisionRepository {
  findById(revisionId: string): Promise<RenderRevisionSnapshotRecord | null>;
}

export class PrismaRenderRevisionRepository implements RenderRevisionRepository {
  readonly #database: PrismaClient;

  constructor(database: PrismaClient) {
    this.#database = database;
  }

  async findById(revisionId: string): Promise<RenderRevisionSnapshotRecord | null> {
    const revision = await this.#database.projectRevision.findUnique({
      where: {
        id: revisionId,
      },
      include: {
        assets: {
          include: {
            asset: true,
          },
          orderBy: {
            assetId: 'asc',
          },
        },
      },
    });

    if (revision === null) {
      return null;
    }

    return {
      id: revision.id,
      projectId: revision.projectId,
      schemaVersion: revision.schemaVersion,
      templateId: revision.templateId,
      templateVersion: revision.templateVersion,
      contentHash: revision.contentHash,
      document: revision.document,
      assets: revision.assets.map(({ asset }) => ({
        id: asset.id,
        kind: asset.kind,
        status: asset.status,
        relativePath: asset.relativePath,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
      })),
    };
  }
}
