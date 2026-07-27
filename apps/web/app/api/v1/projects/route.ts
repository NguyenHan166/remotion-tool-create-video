import { createProjectCollectionHandlers } from '../../../../src/projects/handlers.js';
import { projectService } from '../../../../src/projects/runtime.js';

const handlers = createProjectCollectionHandlers(projectService);

export const dynamic = 'force-dynamic';
export const GET = handlers.GET;
export const POST = handlers.POST;
