import { getHealth } from '../../../../src/health-runtime.js';
import { createHealthHandler } from '../../../../src/health-handler.js';
import { withRequestLogging } from '../../../../src/observability.js';

export const GET = withRequestLogging('health.get', createHealthHandler(getHealth));
