import { createProjectCaptionHandlers } from '../../../../../../src/projects/handlers.js';
import { withRequestLogging } from '../../../../../../src/observability.js';
import { projectService } from '../../../../../../src/projects/runtime.js';

const handlers = createProjectCaptionHandlers(projectService);

export const dynamic = 'force-dynamic';
export const PUT = withRequestLogging('projects.captions.update', handlers.PUT);
