import { PrismaAssetRepository } from '@hansys/database';
import { database } from '../database.js';
import { webServerEnvironment } from '../environment.js';
import { storagePaths } from '../storage.js';
import { DefaultAssetFileService } from './file-service.js';
import { DefaultAssetUploadService } from './service.js';

const BYTES_PER_MEBIBYTE = 1024 * 1024;
const assetRepository = new PrismaAssetRepository(database);

export const assetUploadService = new DefaultAssetUploadService(
  assetRepository,
  storagePaths,
  webServerEnvironment.MAX_UPLOAD_MB * BYTES_PER_MEBIBYTE,
);

export const assetFileService = new DefaultAssetFileService(assetRepository, storagePaths);
