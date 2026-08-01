import { createRenderOutputFileHandlers } from '../../../../../../src/renders/handlers.js';
import { withRequestLogging } from '../../../../../../src/observability.js';
import { renderOutputFileService } from '../../../../../../src/renders/runtime.js';

const handlers = createRenderOutputFileHandlers(renderOutputFileService, 'LOG');

export const dynamic = 'force-dynamic';
export const GET = withRequestLogging('renders.diagnostic', handlers.GET);
