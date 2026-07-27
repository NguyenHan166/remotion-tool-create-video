import { createProjectDuplicateHandlers } from '../../../../../../src/projects/handlers.js';
import { projectService } from '../../../../../../src/projects/runtime.js';

const handlers = createProjectDuplicateHandlers(projectService);

export const dynamic = 'force-dynamic';
export const POST = handlers.POST;
