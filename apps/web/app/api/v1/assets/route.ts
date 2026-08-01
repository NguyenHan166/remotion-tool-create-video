import { createAssetCollectionHandlers } from '../../../../src/assets/handlers.js';
import { withRequestLogging } from '../../../../src/observability.js';
import { assetUploadService } from '../../../../src/assets/runtime.js';

const handlers = createAssetCollectionHandlers(assetUploadService);

export const dynamic = 'force-dynamic';
export const GET = withRequestLogging('assets.list', handlers.GET);
export const POST = withRequestLogging('assets.upload', handlers.POST);
