import { createTemplateCollectionHandlers } from '../../../../src/templates/handlers.js';
import { withRequestLogging } from '../../../../src/observability.js';

const handlers = createTemplateCollectionHandlers();

// Request-scoped logging and request IDs require the route to execute per request.
export const dynamic = 'force-dynamic';
export const GET = withRequestLogging('templates.list', async () => handlers.GET());
