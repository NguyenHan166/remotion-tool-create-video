import { createPrismaClient } from '@hansys/database';
import { workerServerEnvironment } from './environment.js';

export const database = createPrismaClient(workerServerEnvironment.DATABASE_URL);
