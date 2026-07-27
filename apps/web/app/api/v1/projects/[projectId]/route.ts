import { createProjectResourceHandlers } from '../../../../../src/projects/handlers.js';
import { projectService } from '../../../../../src/projects/runtime.js';

const handlers = createProjectResourceHandlers(projectService);

export const dynamic = 'force-dynamic';
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
