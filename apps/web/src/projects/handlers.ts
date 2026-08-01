import {
  AssetNotFoundError,
  ProjectNotFoundError,
  ProjectVersionConflictError,
} from '@hansys/database';
import {
  InvalidProjectDocumentVersionError,
  ProjectDocumentMigrationError,
  ProjectDocumentValidationError,
  SrtParseError,
  UnsupportedProjectDocumentVersionError,
} from '@hansys/project-schema';
import { type ZodError, type ZodIssue } from 'zod';
import {
  createProjectRequestSchema,
  listProjectsQuerySchema,
  projectIdSchema,
  scriptApplyRequestSchema,
  scriptPreviewRequestSchema,
  importSrtVersionSchema,
  updateCaptionsRequestSchema,
  updateProjectRequestSchema,
} from './contracts.js';
import { type ProjectService } from './service.js';
import { getRequestId } from '../observability.js';

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
  const requestId = getRequestId(request);
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
  if (error instanceof SrtParseError) {
    return createErrorResponse(request, {
      status: 400,
      code: error.code,
      message: error.message,
      details: error.details.map((detail) => ({
        path: `file.block.${detail.block}.line.${detail.line}`,
        message: detail.message,
      })),
    });
  }

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

export function createProjectCaptionHandlers(service: ProjectService): {
  PUT: (request: Request, context: ProjectRouteContext) => Promise<Response>;
} {
  return {
    PUT: async (request, context) => {
      const projectIdResult = await parseProjectId(request, context);

      if (!projectIdResult.success) {
        return projectIdResult.response;
      }

      const jsonResult = await readJsonRequest(request);

      if (!jsonResult.success) {
        return jsonResult.response;
      }

      const requestResult = updateCaptionsRequestSchema.safeParse(jsonResult.data);

      if (!requestResult.success) {
        return createErrorResponse(request, {
          status: 400,
          code: 'BAD_REQUEST',
          message: 'Caption update request is invalid.',
          details: formatZodIssues(requestResult.error),
        });
      }

      try {
        return Response.json(
          await service.updateCaptions(projectIdResult.projectId, requestResult.data),
        );
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
  };
}

const MAX_SRT_FILE_BYTES = 2_000_000;

function invalidSrtUpload(request: Request, path: string, message: string): Response {
  return createErrorResponse(request, {
    status: 400,
    code: 'BAD_REQUEST',
    message: 'SRT import request is invalid.',
    details: [{ path, message }],
  });
}

export function createProjectSrtImportHandlers(service: ProjectService): {
  POST: (request: Request, context: ProjectRouteContext) => Promise<Response>;
} {
  return {
    POST: async (request, context) => {
      const projectIdResult = await parseProjectId(request, context);

      if (!projectIdResult.success) {
        return projectIdResult.response;
      }

      if (
        request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;') !==
        true
      ) {
        return invalidSrtUpload(request, 'request', 'Content-Type must be multipart/form-data.');
      }

      let formData: FormData;

      try {
        formData = await request.formData();
      } catch {
        return invalidSrtUpload(request, 'request', 'Request body must be valid multipart data.');
      }

      const files = formData.getAll('file');

      if (files.length !== 1 || !(files[0] instanceof File)) {
        return invalidSrtUpload(request, 'file', 'Exactly one SRT file is required.');
      }

      const file = files[0];

      if (!file.name.toLowerCase().endsWith('.srt')) {
        return invalidSrtUpload(request, 'file', 'File name must use the .srt extension.');
      }

      if (file.size === 0 || file.size > MAX_SRT_FILE_BYTES) {
        return invalidSrtUpload(
          request,
          'file',
          `SRT file size must be from 1 to ${MAX_SRT_FILE_BYTES} bytes.`,
        );
      }

      const versionValues = formData.getAll('expectedDraftVersion');

      if (versionValues.length !== 1 || typeof versionValues[0] !== 'string') {
        return invalidSrtUpload(
          request,
          'expectedDraftVersion',
          'Expected draft version is required.',
        );
      }

      const versionResult = importSrtVersionSchema.safeParse(versionValues[0]);

      if (!versionResult.success) {
        return invalidSrtUpload(
          request,
          'expectedDraftVersion',
          versionResult.error.issues[0]?.message ?? 'Expected draft version is invalid.',
        );
      }

      let source: string;

      try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        return invalidSrtUpload(request, 'file', 'SRT file must contain valid UTF-8 text.');
      }

      try {
        return Response.json(
          await service.importSrtCaptions(projectIdResult.projectId, {
            expectedDraftVersion: versionResult.data,
            source,
          }),
        );
      } catch (error) {
        return handleProjectError(request, error);
      }
    },
  };
}
