import { createPrismaClient } from '@hansys/database';
import { webServerEnvironment } from './environment.js';

export const database = createPrismaClient(webServerEnvironment.DATABASE_URL);
