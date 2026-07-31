import { randomUUID } from 'node:crypto';
import {
  AssetNotFoundError,
  ProjectNotFoundError,
  ProjectNotRenderableError,
  RenderAssetNotReadyError,
} from '@hansys/database';
import { ProjectDocumentValidationError } from '@hansys/project-schema';
import { TemplateNotFoundError, TemplateVersionMismatchError } from '@hansys/template-registry';
import { type ZodError, type ZodIssue } from 'zod';
import { createRenderRequestSchema, listRendersQuerySchema, renderIdSchema } from './contracts.js';
import {
  RenderRecordNotFoundError,
  RenderTemplateValidationError,
  type RenderService,
} from './service.js';

type ErrorDetail = {
  path: string;
  message: string;
};

type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: readonly ErrorDetail[];
    requestId: string;
  };
};

function formatZodIssues(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue: ZodIssue) => ({
    path: issue.path.length === 0 ? 'request' : issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function createErrorResponse(
  request: Request,
  status: number,
  code: string,
  message: string,
  details?: readonly ErrorDetail[],
): Response {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const body: ErrorEnvelope = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId,
    },
  };

  return Response.json(body, {
    status,
    headers: {
      'X-Request-ID': requestId,
    },
  });
}

function handleRenderServiceError(request: Request, error: unknown): Response {
  if (error instanceof ProjectNotFoundError) {
    return createErrorResponse(request, 404, error.code, 'Project not found.');
  }

  if (error instanceof AssetNotFoundError) {
    return createErrorResponse(
      request,
      404,
      error.code,
      'One or more referenced assets were not found.',
      error.assetIds.map((assetId) => ({
        path: 'document',
        message: `Referenced asset not found: ${assetId}`,
      })),
    );
  }

  if (error instanceof RenderAssetNotReadyError) {
    return createErrorResponse(
      request,
      409,
      error.code,
      'One or more referenced assets are not ready.',
      error.assetIds.map((assetId) => ({
        path: 'document',
        message: `Referenced asset is not ready: ${assetId}`,
      })),
    );
  }

  if (error instanceof ProjectNotRenderableError) {
    return createErrorResponse(
      request,
      409,
      error.code,
      'Project cannot be rendered in its current state.',
    );
  }

  if (error instanceof TemplateNotFoundError) {
    return createErrorResponse(request, 404, error.code, 'Project template not found.');
  }

  if (error instanceof TemplateVersionMismatchError) {
    return createErrorResponse(
      request,
      409,
      error.code,
      'Project template version is unavailable.',
    );
  }

  if (error instanceof RenderTemplateValidationError) {
    return createErrorResponse(
      request,
      422,
      error.code,
      'Project document is incompatible with its template.',
      error.details.map((detail) => ({
        path: detail.path,
        message: detail.message,
      })),
    );
  }

  if (error instanceof ProjectDocumentValidationError) {
    return createErrorResponse(
      request,
      422,
      error.code,
      'Project document is invalid.',
      error.details,
    );
  }

  if (error instanceof RenderRecordNotFoundError) {
    return createErrorResponse(request, 404, error.code, 'Render job not found.');
  }

  return createErrorResponse(request, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

export type RenderResourceRouteContext = {
  params: Promise<{ renderId: string }>;
};

export function createRenderCollectionHandlers(service: RenderService): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
} {
  return {
    GET: async (request) => {
      const url = new URL(request.url);
      const queryResult = listRendersQuerySchema.safeParse({
        page: url.searchParams.get('page') ?? undefined,
        pageSize: url.searchParams.get('pageSize') ?? undefined,
        projectId: url.searchParams.get('projectId') || undefined,
        status: url.searchParams.get('status') ?? undefined,
      });

      if (!queryResult.success) {
        return createErrorResponse(
          request,
          400,
          'BAD_REQUEST',
          'Render query is invalid.',
          formatZodIssues(queryResult.error),
        );
      }

      try {
        return Response.json(await service.list(queryResult.data));
      } catch (error) {
        return handleRenderServiceError(request, error);
      }
    },
    POST: async (request) => {
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return createErrorResponse(request, 400, 'BAD_REQUEST', 'Request body must be valid JSON.');
      }

      const bodyResult = createRenderRequestSchema.safeParse(body);

      if (!bodyResult.success) {
        return createErrorResponse(
          request,
          400,
          'BAD_REQUEST',
          'Render request is invalid.',
          formatZodIssues(bodyResult.error),
        );
      }

      try {
        return Response.json(await service.enqueue(bodyResult.data), { status: 201 });
      } catch (error) {
        return handleRenderServiceError(request, error);
      }
    },
  };
}

export function createRenderResourceHandlers(service: RenderService): {
  GET: (request: Request, context: RenderResourceRouteContext) => Promise<Response>;
} {
  return {
    GET: async (request, context) => {
      const { renderId } = await context.params;
      const renderIdResult = renderIdSchema.safeParse(renderId);

      if (!renderIdResult.success) {
        return createErrorResponse(
          request,
          400,
          'BAD_REQUEST',
          'Render ID is invalid.',
          formatZodIssues(renderIdResult.error),
        );
      }

      try {
        return Response.json(await service.get(renderIdResult.data));
      } catch (error) {
        return handleRenderServiceError(request, error);
      }
    },
  };
}
