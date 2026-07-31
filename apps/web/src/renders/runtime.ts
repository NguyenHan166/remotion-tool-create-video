import { PrismaRenderJobRepository } from '@hansys/database';
import { database } from '../database.js';
import { DefaultRenderService } from './service.js';

const renderJobRepository = new PrismaRenderJobRepository(database);

export const renderService = new DefaultRenderService(renderJobRepository);
