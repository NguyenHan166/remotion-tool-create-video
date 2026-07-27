import { createProjectScriptApplyHandlers } from '../../../../../../src/projects/handlers.js';
import { projectService } from '../../../../../../src/projects/runtime.js';

const handlers = createProjectScriptApplyHandlers(projectService);

export const dynamic = 'force-dynamic';
export const POST = handlers.POST;
