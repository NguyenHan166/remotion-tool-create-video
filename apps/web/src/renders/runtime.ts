import { PrismaRenderJobRepository } from '@hansys/database';
import { database } from '../database.js';
import { webServerEnvironment } from '../environment.js';
import { storagePaths } from '../storage.js';
import { DefaultRenderOutputFileService } from './file-service.js';
import { DefaultRenderService } from './service.js';

const renderJobRepository = new PrismaRenderJobRepository(database);

export const renderService = new DefaultRenderService(renderJobRepository, {
  maxAttempts: webServerEnvironment.RENDER_MAX_ATTEMPTS,
});

export const renderOutputFileService = new DefaultRenderOutputFileService(
  renderJobRepository,
  storagePaths,
);
