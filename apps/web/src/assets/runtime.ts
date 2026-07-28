import { PrismaAssetRepository } from '@hansys/database';
import { database } from '../database.js';
import { webServerEnvironment } from '../environment.js';
import { storagePaths } from '../storage.js';
import { DefaultAssetUploadService } from './service.js';

const BYTES_PER_MEBIBYTE = 1024 * 1024;

export const assetUploadService = new DefaultAssetUploadService(
  new PrismaAssetRepository(database),
  storagePaths,
  webServerEnvironment.MAX_UPLOAD_MB * BYTES_PER_MEBIBYTE,
);
