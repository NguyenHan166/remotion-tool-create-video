import { getHealth } from '../../../../src/health-runtime.js';
import { createHealthHandler } from '../../../../src/health-handler.js';

export const GET = createHealthHandler(getHealth);
