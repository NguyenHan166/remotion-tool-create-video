import { z } from 'zod';

export const assetIdSchema = z.uuid('Must be a UUID');

export const listAssetsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.uuid('Must be a UUID').optional(),
  kind: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'FONT', 'LOGO', 'SUBTITLE']).optional(),
  status: z.enum(['PROCESSING', 'READY', 'FAILED', 'DELETED']).optional(),
  search: z.string().trim().min(1).max(500).optional(),
});

export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
