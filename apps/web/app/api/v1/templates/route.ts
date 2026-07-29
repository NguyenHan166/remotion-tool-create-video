import { createTemplateCollectionHandlers } from '../../../../src/templates/handlers.js';

const handlers = createTemplateCollectionHandlers();

export const dynamic = 'force-static';
export const GET = handlers.GET;
