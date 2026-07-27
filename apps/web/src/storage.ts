import { initializeStorage } from '@hansys/storage';
import { webServerEnvironment } from './environment.js';

export const storagePaths = await initializeStorage(webServerEnvironment.DATA_DIR);
