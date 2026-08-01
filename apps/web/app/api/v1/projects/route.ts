import { createProjectCollectionHandlers } from '../../../../src/projects/handlers.js';
import { withRequestLogging } from '../../../../src/observability.js';
import { projectService } from '../../../../src/projects/runtime.js';

const handlers = createProjectCollectionHandlers(projectService);

export const dynamic = 'force-dynamic';
export const GET = withRequestLogging('projects.list', handlers.GET);
export const POST = withRequestLogging('projects.create', handlers.POST);
