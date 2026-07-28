import { randomUUID } from 'node:crypto';
import {
  AssetNotFoundError,
  ProjectNotFoundError,
  ProjectVersionConflictError,
} from '@hansys/database';
import {
  InvalidProjectDocumentVersionError,
  ProjectDocumentMigrationError,
  ProjectDocumentValidationError,
  UnsupportedProjectDocumentVersionError,
} from '@hansys/project-schema';
import { type ZodError, type ZodIssue } from 'zod';
import {
  createProjectRequestSchema,
  listProjectsQuerySchema,
  projectIdSchema,
  scriptApplyRequestSchema,
  scriptPreviewRequestSchema,
  updateProjectRequestSchema,
} from './contracts.js';
import { type ProjectService } from './service.js';

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

export type ProjectRouteContext = {
  params: Promise<{ projectId: string }>;
};

type ErrorResponseOptions = {
  status: number;
  code: string;
  message: string;
  details?: readonly ErrorDetail[];
};

function formatZodIssues(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue: ZodIssue) => ({
    path: issue.path.length === 0 ? 'request' : issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function createErrorResponse(request: Request, options: ErrorResponseOptions): Response {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const body: ErrorEnvelope = {
    error: {
      code: options.code,
      message: options.message,
      ...(options.details === undefined ? {} : { details: options.details }),
      requestId,
    },
  };

  return Response.json(body, {
    status: options.status,
    headers: {
      'X-Request-ID': requestId,
    },
  });
}

function handleProjectError(request: Request, error: unknown): Response {
  if (error instanceof AssetNotFoundError) {
    return createErrorResponse(request, {
      status: 404,
      code: error.code,
      message: 'One or more referenced assets were not found.',
      details: error.assetIds.map((assetId) => ({
        path: 'document',
        message: `Referenced asset not found: ${assetId}`,
      })),
    });
  }

  if (error instanceof ProjectNotFoundError) {
    return createErrorResponse(request, {
      status: 404,
      code: error.code,
      message: 'Project not found.',
    });
  }

  if (error instanceof ProjectVersionConflictError) {
    return createErrorResponse(request, {
      status: 409,
      code: error.code,
      message: 'Project draft version conflict.',
      details: [
        {
          path: 'expectedDraftVersion',
          message: `Expected version ${error.expectedDraftVersion}; current version is ${error.actualDraftVersion}.`,
        },
      ],
    });
  }

  if (error instanceof ProjectDocumentValidationError) {
    return createErrorResponse(request, {
      status: 400,
      code: error.code,
      message: error.message,
      details: error.details,
    });
  }

  if (
    error instanceof InvalidProjectDocumentVersionError ||
    error instanceof UnsupportedProjectDocumentVersionError ||
    error instanceof ProjectDocumentMigrationError
  ) {
    return createErrorResponse(request, {
      status: 400,
      code: 'PROJECT_VALIDATION_FAILED',
      message: 'Project document is invalid.',
      details: [
        {
          path: 'document.schemaVersion',
          message: error.message,
        },
      ],
    });
  }

  return createErrorResponse(request, {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
  });
}

async function readJsonRequest(request: Request): Promise<
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      response: Response;
    }
> {
  try {
    return {
      success: true,
      data: await request.json(),
    };
  } catch {
    return {
      success: false,
      response: createErrorResponse(request, {
        status: 400,
        code: 'BAD_REQUEST',
        message: 'Request body must be valid JSON.',
      }),
    };
  }
}

async function parseProjectId(
  request: Request,
  context: ProjectRouteContext,
): Promise<
  | {
      success: true;
      projectId: string;
    }
  | {
      success: false;
      response: Response;
    }
> {
  const { projectId } = await context.params;
  const result = projectIdSchema.safeParse(projectId);

  if (!result.success) {
    return {
      success: false,
      response: createErrorResponse(request, {
        status: 400,
        code: 'BAD_REQUEST',
        message: 'Project ID is invalid.',
        details: [
          {
            path: 'projectId',
            message: result.error.issues[0]?.message ?? 'Must be a UUID',
          },
        ],
      }),
    };
  }

  return {
    success: true,
    projectId: result.data,
  };
}

export function createProjectCollectionHandlers(service: ProjectService): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
} {
  return {
    GET: async (request) => {
      const url = new URL(request.url);
      const queryResult = listProjectsQuerySchema.safeParse({
        page: url.searchParams.get('page') ?? undefined,
        pageSize: url.searchParams.get('pageSize') ?? undefined,
        search: url.searchParams.get('search') || undefined,
        status: url.searchParams.get('status') ?? undefined,
      });

      if (!queryResult.success) {
        return createErrorResponse(request, {
          status: 400,
          code: 'BAD_REQUEST',
          message: 'Project query is invalid.',
          details: formatZodIssues(queryResult.error),
        });
      }

      try {
        return Response.json(await service.list(queryResult.data));
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
    POST: async (request) => {
      const jsonResult = await readJsonRequest(request);

      if (!jsonResult.success) {
        return jsonResult.response;
      }

      const requestResult = createProjectRequestSchema.safeParse(jsonResult.data);

      if (!requestResult.success) {
        return createErrorResponse(request, {
          status: 400,
          code: 'BAD_REQUEST',
          message: 'Create project request is invalid.',
          details: formatZodIssues(requestResult.error),
        });
      }

      try {
        return Response.json(await service.create(requestResult.data), {
          status: 201,
        });
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
  };
}

export function createProjectResourceHandlers(service: ProjectService): {
  GET: (request: Request, context: ProjectRouteContext) => Promise<Response>;
  PATCH: (request: Request, context: ProjectRouteContext) => Promise<Response>;
  DELETE: (request: Request, context: ProjectRouteContext) => Promise<Response>;
} {
  return {
    GET: async (request, context) => {
      const projectIdResult = await parseProjectId(request, context);

      if (!projectIdResult.success) {
        return projectIdResult.response;
      }

      try {
        return Response.json(await service.get(projectIdResult.projectId));
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
    PATCH: async (request, context) => {
      const projectIdResult = await parseProjectId(request, context);

      if (!projectIdResult.success) {
        return projectIdResult.response;
      }

      const jsonResult = await readJsonRequest(request);

      if (!jsonResult.success) {
        return jsonResult.response;
      }

      const requestResult = updateProjectRequestSchema.safeParse(jsonResult.data);

      if (!requestResult.success) {
        return createErrorResponse(request, {
          status: 400,
          code: 'BAD_REQUEST',
          message: 'Update project request is invalid.',
          details: formatZodIssues(requestResult.error),
        });
      }

      try {
        return Response.json(await service.update(projectIdResult.projectId, requestResult.data));
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
    DELETE: async (request, context) => {
      const projectIdResult = await parseProjectId(request, context);

      if (!projectIdResult.success) {
        return projectIdResult.response;
      }

      try {
        await service.archive(projectIdResult.projectId);

        return new Response(null, { status: 204 });
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
  };
}

export function createProjectDuplicateHandlers(service: ProjectService): {
  POST: (request: Request, context: ProjectRouteContext) => Promise<Response>;
} {
  return {
    POST: async (request, context) => {
      const projectIdResult = await parseProjectId(request, context);

      if (!projectIdResult.success) {
        return projectIdResult.response;
      }

      try {
        return Response.json(await service.duplicate(projectIdResult.projectId), {
          status: 201,
        });
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
  };
}

export function createProjectRevisionHandlers(service: ProjectService): {
  GET: (request: Request, context: ProjectRouteContext) => Promise<Response>;
  POST: (request: Request, context: ProjectRouteContext) => Promise<Response>;
} {
  return {
    GET: async (request, context) => {
      const projectIdResult = await parseProjectId(request, context);

      if (!projectIdResult.success) {
        return projectIdResult.response;
      }

      try {
        return Response.json({
          items: await service.listRevisions(projectIdResult.projectId),
        });
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
    POST: async (request, context) => {
      const projectIdResult = await parseProjectId(request, context);

      if (!projectIdResult.success) {
        return projectIdResult.response;
      }

      try {
        return Response.json(await service.createRevision(projectIdResult.projectId), {
          status: 201,
        });
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
  };
}

export function createProjectScriptPreviewHandlers(service: ProjectService): {
  POST: (request: Request, context: ProjectRouteContext) => Promise<Response>;
} {
  return {
    POST: async (request, context) => {
      const projectIdResult = await parseProjectId(request, context);

      if (!projectIdResult.success) {
        return projectIdResult.response;
      }

      const jsonResult = await readJsonRequest(request);

      if (!jsonResult.success) {
        return jsonResult.response;
      }

      const requestResult = scriptPreviewRequestSchema.safeParse(jsonResult.data);

      if (!requestResult.success) {
        return createErrorResponse(request, {
          status: 400,
          code: 'BAD_REQUEST',
          message: 'Script preview request is invalid.',
          details: formatZodIssues(requestResult.error),
        });
      }

      try {
        return Response.json(
          await service.previewScript(projectIdResult.projectId, requestResult.data),
        );
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
  };
}

export function createProjectScriptApplyHandlers(service: ProjectService): {
  POST: (request: Request, context: ProjectRouteContext) => Promise<Response>;
} {
  return {
    POST: async (request, context) => {
      const projectIdResult = await parseProjectId(request, context);

      if (!projectIdResult.success) {
        return projectIdResult.response;
      }

      const jsonResult = await readJsonRequest(request);

      if (!jsonResult.success) {
        return jsonResult.response;
      }

      const requestResult = scriptApplyRequestSchema.safeParse(jsonResult.data);

      if (!requestResult.success) {
        return createErrorResponse(request, {
          status: 400,
          code: 'BAD_REQUEST',
          message: 'Script apply request is invalid.',
          details: formatZodIssues(requestResult.error),
        });
      }

      try {
        return Response.json(
          await service.applyScript(projectIdResult.projectId, requestResult.data),
        );
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
  };
}
