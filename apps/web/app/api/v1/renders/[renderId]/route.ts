import { createRenderResourceHandlers } from '../../../../../src/renders/handlers.js';
import { withRequestLogging } from '../../../../../src/observability.js';
import { renderService } from '../../../../../src/renders/runtime.js';

const handlers = createRenderResourceHandlers(renderService);

export const dynamic = 'force-dynamic';
export const GET = withRequestLogging('renders.get', handlers.GET);
