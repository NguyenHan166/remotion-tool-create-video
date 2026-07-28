import { randomUUID } from 'node:crypto';
import { createAssetStorageLocation } from '@hansys/storage';
import type {
  Asset,
  AssetKind,
  AssetStatus,
  Prisma,
  PrismaClient,
} from '../generated/prisma/client.js';

export type CreateAssetRecordInput = {
  id?: string;
  kind: AssetKind;
  originalName: string;
  fileExtension: string;
  mimeType: string;
  sizeBytes: bigint;
  sha256: string;
  projectId?: string;
};

export type ListAssetRecordsInput = {
  page: number;
  pageSize: number;
  projectId?: string;
  kind?: AssetKind;
  status?: AssetStatus;
  search?: string;
};

export type AssetRecordPage = {
  items: Asset[];
  total: number;
};

export interface AssetRepository {
  create(input: CreateAssetRecordInput): Promise<Asset>;
  findById(assetId: string): Promise<Asset | null>;
  list(input: ListAssetRecordsInput): Promise<AssetRecordPage>;
}

export class PrismaAssetRepository implements AssetRepository {
  readonly #database: PrismaClient;
  readonly #createId: () => string;

  constructor(database: PrismaClient, createId: () => string = randomUUID) {
    this.#database = database;
    this.#createId = createId;
  }

  async create(input: CreateAssetRecordInput): Promise<Asset> {
    const id = input.id ?? this.#createId();
    const storageLocation = createAssetStorageLocation(id, input.fileExtension);

    return this.#database.asset.create({
      data: {
        id,
        kind: input.kind,
        originalName: input.originalName,
        storedName: storageLocation.storedName,
        relativePath: storageLocation.relativePath,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        ...(input.projectId === undefined
          ? {}
          : {
              projects: {
                create: {
                  projectId: input.projectId,
                },
              },
            }),
      },
    });
  }

  async findById(assetId: string): Promise<Asset | null> {
    return this.#database.asset.findUnique({
      where: {
        id: assetId,
      },
    });
  }

  async list({
    page,
    pageSize,
    projectId,
    kind,
    status,
    search,
  }: ListAssetRecordsInput): Promise<AssetRecordPage> {
    const where: Prisma.AssetWhereInput = {
      ...(projectId === undefined
        ? {}
        : {
            projects: {
              some: {
                projectId,
              },
            },
          }),
      ...(kind === undefined ? {} : { kind }),
      ...(status === undefined ? {} : { status }),
      ...(search === undefined
        ? {}
        : {
            originalName: {
              contains: search,
              mode: 'insensitive',
            },
          }),
    };
    const [items, total] = await this.#database.$transaction([
      this.#database.asset.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.#database.asset.count({ where }),
    ]);

    return {
      items,
      total,
    };
  }
}
