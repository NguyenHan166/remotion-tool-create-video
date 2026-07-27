import { PrismaProjectRepository } from '@hansys/database';
import { database } from '../database.js';
import { DefaultProjectService } from './service.js';

export const projectService = new DefaultProjectService(new PrismaProjectRepository(database));
