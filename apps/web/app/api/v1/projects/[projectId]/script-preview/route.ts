import { createProjectScriptPreviewHandlers } from '../../../../../../src/projects/handlers.js';
import { withRequestLogging } from '../../../../../../src/observability.js';
import { projectService } from '../../../../../../src/projects/runtime.js';

const handlers = createProjectScriptPreviewHandlers(projectService);

export const dynamic = 'force-dynamic';
export const POST = withRequestLogging('projects.script_preview', handlers.POST);
