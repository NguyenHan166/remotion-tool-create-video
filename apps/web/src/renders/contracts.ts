import { z } from 'zod';

export const renderIdSchema = z.uuid('Must be a UUID');

export const createRenderRequestSchema = z.strictObject({
  projectId: z.uuid('Must be a UUID'),
  preset: z.enum(['draft', 'vertical-h264', 'vertical-high']),
});

export const listRendersQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.uuid('Must be a UUID').optional(),
  status: z
    .enum([
      'QUEUED',
      'PREPARING',
      'BUNDLING',
      'RENDERING',
      'ENCODING',
      'COMPLETED',
      'FAILED',
      'CANCEL_REQUESTED',
      'CANCELLED',
    ])
    .optional(),
});

export type ListRendersQuery = z.infer<typeof listRendersQuerySchema>;
export type CreateRenderRequest = z.infer<typeof createRenderRequestSchema>;
