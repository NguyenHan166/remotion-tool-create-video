import { randomUUID } from 'node:crypto';
import {
  InvalidByteRangeError,
  UnsupportedMediaTypeError,
  UploadTooLargeError,
} from '@hansys/storage';
import { z } from 'zod';
import {
  AssetFileNotFoundError,
  AssetNotReadyError,
  type AssetFileService,
} from './file-service.js';
import { AssetMetadataProcessingError, type AssetUploadService } from './service.js';

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

type ErrorResponseOptions = {
  status: number;
  code: string;
  message: string;
  details?: readonly ErrorDetail[];
  headers?: HeadersInit;
};

const projectIdSchema = z.uuid();
const assetIdSchema = z.uuid();

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

  const headers = new Headers(options.headers);
  headers.set('X-Request-ID', requestId);

  return Response.json(body, {
    status: options.status,
    headers,
  });
}

export type AssetFileRouteContext = {
  params: Promise<{ assetId: string }> | { assetId: string };
};

export function createAssetFileHandlers(service: AssetFileService): {
  GET: (request: Request, context: AssetFileRouteContext) => Promise<Response>;
} {
  return {
    GET: async (request, context) => {
      const { assetId } = await context.params;
      const assetIdResult = assetIdSchema.safeParse(assetId);

      if (!assetIdResult.success) {
        return createErrorResponse(request, {
          status: 400,
          code: 'BAD_REQUEST',
          message: 'Asset ID is invalid.',
          details: [
            {
              path: 'assetId',
              message: assetIdResult.error.issues[0]?.message ?? 'Must be a UUID',
            },
          ],
        });
      }

      try {
        const result = await service.stream(
          assetIdResult.data,
          request.headers.get('range') ?? undefined,
        );

        return new Response(result.body, {
          status: result.status,
          headers: result.headers,
        });
      } catch (error) {
        if (error instanceof InvalidByteRangeError) {
          return createErrorResponse(request, {
            status: 416,
            code: 'BAD_REQUEST',
            message: 'Requested byte range is not satisfiable.',
            headers: {
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes */${error.fileSize}`,
            },
          });
        }

        if (error instanceof AssetFileNotFoundError) {
          return createErrorResponse(request, {
            status: 404,
            code: error.code,
            message: 'Asset not found.',
          });
        }

        if (error instanceof AssetNotReadyError) {
          return createErrorResponse(request, {
            status: 409,
            code: error.code,
            message: 'Asset is not ready for streaming.',
          });
        }

        return createErrorResponse(request, {
          status: 500,
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        });
      }
    },
  };
}

function handleUploadError(request: Request, error: unknown): Response {
  if (error instanceof AssetMetadataProcessingError) {
    return createErrorResponse(request, {
      status: error.responseStatus,
      code: error.responseCode,
      message:
        error.responseCode === 'UNSUPPORTED_MEDIA_TYPE'
          ? 'The uploaded media could not be read.'
          : 'Media metadata extraction is unavailable.',
      ...(error.responseCode === 'UNSUPPORTED_MEDIA_TYPE'
        ? {
            details: [
              {
                path: 'file',
                message: 'The media container or streams are invalid.',
              },
            ],
          }
        : {}),
    });
  }

  if (error instanceof UploadTooLargeError) {
    return createErrorResponse(request, {
      status: 413,
      code: error.code,
      message: 'The uploaded file is too large.',
      details: [
        {
          path: 'file',
          message: `Maximum upload size is ${error.maxBytes} bytes.`,
        },
      ],
    });
  }

  if (error instanceof UnsupportedMediaTypeError) {
    return createErrorResponse(request, {
      status: 415,
      code: error.code,
      message: 'The uploaded file type is unsupported or does not match its extension.',
      details: [
        {
          path: 'file',
          message: 'Use a supported media extension with matching file content.',
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

function invalidMultipartResponse(
  request: Request,
  path: 'request' | 'file' | 'projectId',
  message: string,
): Response {
  return createErrorResponse(request, {
    status: 400,
    code: 'BAD_REQUEST',
    message: 'Multipart upload request is invalid.',
    details: [
      {
        path,
        message,
      },
    ],
  });
}

export function createAssetCollectionHandlers(service: AssetUploadService): {
  POST: (request: Request) => Promise<Response>;
} {
  return {
    POST: async (request) => {
      const contentType = request.headers.get('content-type')?.toLowerCase();

      if (contentType?.startsWith('multipart/form-data;') !== true) {
        return invalidMultipartResponse(
          request,
          'request',
          'Content-Type must be multipart/form-data.',
        );
      }

      let formData: FormData;

      try {
        formData = await request.formData();
      } catch {
        return invalidMultipartResponse(
          request,
          'request',
          'Request body must be valid multipart data.',
        );
      }

      const files = formData.getAll('file');

      if (files.length !== 1 || !(files[0] instanceof File)) {
        return invalidMultipartResponse(request, 'file', 'Exactly one file is required.');
      }

      const file = files[0];

      if (file.name.length === 0 || file.name.length > 500) {
        return invalidMultipartResponse(
          request,
          'file',
          'File name must contain 1 to 500 characters.',
        );
      }

      const projectValues = formData.getAll('projectId');
      let projectId: string | undefined;

      if (projectValues.length > 1 || projectValues.some((value) => typeof value !== 'string')) {
        return invalidMultipartResponse(
          request,
          'projectId',
          'projectId must be a single UUID value.',
        );
      }

      const projectValue = projectValues[0];

      if (typeof projectValue === 'string' && projectValue.length > 0) {
        const projectIdResult = projectIdSchema.safeParse(projectValue);

        if (!projectIdResult.success) {
          return invalidMultipartResponse(request, 'projectId', 'projectId must be a valid UUID.');
        }

        projectId = projectIdResult.data;
      }

      try {
        return Response.json(
          await service.upload({
            file,
            ...(projectId === undefined ? {} : { projectId }),
          }),
          { status: 201 },
        );
      } catch (error) {
        return handleUploadError(request, error);
      }
    },
  };
}
