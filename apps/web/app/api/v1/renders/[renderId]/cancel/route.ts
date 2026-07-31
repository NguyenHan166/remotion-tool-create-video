import { createRenderCancellationHandlers } from '../../../../../../src/renders/handlers.js';
import { renderService } from '../../../../../../src/renders/runtime.js';

const handlers = createRenderCancellationHandlers(renderService);

export const dynamic = 'force-dynamic';
export const POST = handlers.POST;
