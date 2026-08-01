import { createProjectSrtImportHandlers } from '../../../../../../../src/projects/handlers.js';
import { withRequestLogging } from '../../../../../../../src/observability.js';
import { projectService } from '../../../../../../../src/projects/runtime.js';

const handlers = createProjectSrtImportHandlers(projectService);

export const dynamic = 'force-dynamic';
export const POST = withRequestLogging('projects.captions.import_srt', handlers.POST);
