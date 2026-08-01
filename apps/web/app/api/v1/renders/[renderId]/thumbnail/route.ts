import { createRenderOutputFileHandlers } from '../../../../../../src/renders/handlers.js';
import { renderOutputFileService } from '../../../../../../src/renders/runtime.js';

const handlers = createRenderOutputFileHandlers(renderOutputFileService, 'THUMBNAIL');

export const dynamic = 'force-dynamic';
export const GET = handlers.GET;
