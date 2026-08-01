import { createProjectCaptionHandlers } from '../../../../../../src/projects/handlers.js';
import { projectService } from '../../../../../../src/projects/runtime.js';

const handlers = createProjectCaptionHandlers(projectService);

export const dynamic = 'force-dynamic';
export const PUT = handlers.PUT;
