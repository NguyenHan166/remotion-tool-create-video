import { createRenderRetryHandlers } from '../../../../../../src/renders/handlers.js';
import { withRequestLogging } from '../../../../../../src/observability.js';
import { renderService } from '../../../../../../src/renders/runtime.js';

const handlers = createRenderRetryHandlers(renderService);

export const dynamic = 'force-dynamic';
export const POST = withRequestLogging('renders.retry', handlers.POST);
