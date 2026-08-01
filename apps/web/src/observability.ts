import {
  createStructuredLogger,
  normalizeRequestId,
  type StructuredLogger,
} from '@hansys/shared/observability';

const requestIds = new WeakMap<Request, string>();

export const webLogger = createStructuredLogger({ context: { service: 'web' } });

export function getRequestId(request: Request): string {
  const existing = requestIds.get(request);

  if (existing !== undefined) {
    return existing;
  }

  const requestId = normalizeRequestId(request.headers.get('x-request-id'));
  requestIds.set(request, requestId);
  return requestId;
}

function responseWithRequestId(response: Response, requestId: string): Response {
  response.headers.set('X-Request-ID', requestId);
  return response;
}

export function withRequestLogging(
  route: string,
  handler: (request: Request) => Response | Promise<Response>,
): (request: Request) => Promise<Response>;
export function withRequestLogging<Context>(
  route: string,
  handler: (request: Request, context: Context) => Response | Promise<Response>,
): (request: Request, context: Context) => Promise<Response>;
export function withRequestLogging<Context>(
  route: string,
  handler: (request: Request, context?: Context) => Response | Promise<Response>,
): (request: Request, context?: Context) => Promise<Response> {
  return async (request, context) => {
    const requestId = getRequestId(request);
    const logger = webLogger.child({ requestId, route, method: request.method });
    logger.info('http.request');

    try {
      const response = await handler(request, context as Context);
      logger.info('http.response', { status: response.status });
      return responseWithRequestId(response, requestId);
    } catch (error) {
      logger.error('http.handler_failed', {}, error);
      throw error;
    }
  };
}

export function createRequestLogger(
  request: Request,
  context: Record<string, unknown> = {},
): StructuredLogger {
  return webLogger.child({ requestId: getRequestId(request), ...context });
}
