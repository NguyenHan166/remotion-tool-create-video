import { createRenderCollectionHandlers } from '../../../../src/renders/handlers.js';
import { withRequestLogging } from '../../../../src/observability.js';
import { renderService } from '../../../../src/renders/runtime.js';

const handlers = createRenderCollectionHandlers(renderService);

export const dynamic = 'force-dynamic';
export const GET = withRequestLogging('renders.list', handlers.GET);
export const POST = withRequestLogging('renders.enqueue', handlers.POST);
