import { createAssetResourceHandlers } from '../../../../../src/assets/handlers.js';
import { assetUploadService } from '../../../../../src/assets/runtime.js';

const handlers = createAssetResourceHandlers(assetUploadService);

export const dynamic = 'force-dynamic';
export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
