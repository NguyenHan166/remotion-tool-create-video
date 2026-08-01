import { createRenderCancellationHandlers } from '../../../../../../src/renders/handlers.js';
import { withRequestLogging } from '../../../../../../src/observability.js';
import { renderService } from '../../../../../../src/renders/runtime.js';

const handlers = createRenderCancellationHandlers(renderService);

export const dynamic = 'force-dynamic';
export const POST = withRequestLogging('renders.cancel', handlers.POST);
