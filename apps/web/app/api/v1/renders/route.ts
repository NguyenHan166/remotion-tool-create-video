import { createRenderCollectionHandlers } from '../../../../src/renders/handlers.js';
import { renderService } from '../../../../src/renders/runtime.js';

const handlers = createRenderCollectionHandlers(renderService);

export const dynamic = 'force-dynamic';
export const GET = handlers.GET;
