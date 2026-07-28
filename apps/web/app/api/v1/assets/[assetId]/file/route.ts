import { createAssetFileHandlers } from '../../../../../../src/assets/handlers.js';
import { assetFileService } from '../../../../../../src/assets/runtime.js';

const handlers = createAssetFileHandlers(assetFileService);

export const dynamic = 'force-dynamic';
export const GET = handlers.GET;
