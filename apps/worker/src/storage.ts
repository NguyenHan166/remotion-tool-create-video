import { initializeStorage } from '@hansys/storage';
import { workerServerEnvironment } from './environment.js';

export const storagePaths = await initializeStorage(workerServerEnvironment.DATA_DIR);
