import { createAssetResourceHandlers } from '../../../../../src/assets/handlers.js';
import { withRequestLogging } from '../../../../../src/observability.js';
import { assetUploadService } from '../../../../../src/assets/runtime.js';

const handlers = createAssetResourceHandlers(assetUploadService);

export const dynamic = 'force-dynamic';
export const GET = withRequestLogging('assets.get', handlers.GET);
export const DELETE = withRequestLogging('assets.delete', handlers.DELETE);
