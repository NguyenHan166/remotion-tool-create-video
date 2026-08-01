import { createProjectResourceHandlers } from '../../../../../src/projects/handlers.js';
import { withRequestLogging } from '../../../../../src/observability.js';
import { projectService } from '../../../../../src/projects/runtime.js';

const handlers = createProjectResourceHandlers(projectService);

export const dynamic = 'force-dynamic';
export const GET = withRequestLogging('projects.get', handlers.GET);
export const PATCH = withRequestLogging('projects.update', handlers.PATCH);
export const DELETE = withRequestLogging('projects.archive', handlers.DELETE);
