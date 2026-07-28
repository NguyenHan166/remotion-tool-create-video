import { createAssetCollectionHandlers } from '../../../../src/assets/handlers.js';
import { assetUploadService } from '../../../../src/assets/runtime.js';

const handlers = createAssetCollectionHandlers(assetUploadService);

export const dynamic = 'force-dynamic';
export const POST = handlers.POST;
