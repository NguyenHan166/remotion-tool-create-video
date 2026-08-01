import { createAssetFileHandlers } from '../../../../../../src/assets/handlers.js';
import { withRequestLogging } from '../../../../../../src/observability.js';
import { assetFileService } from '../../../../../../src/assets/runtime.js';

const handlers = createAssetFileHandlers(assetFileService);

export const dynamic = 'force-dynamic';
export const GET = withRequestLogging('assets.file', handlers.GET);
