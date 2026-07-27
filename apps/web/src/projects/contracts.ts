import { z } from 'zod';

const framesPerSecondSchema = z.literal([24, 25, 30, 50, 60]);

export const createProjectRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5_000).optional(),
  templateId: z.string().trim().min(1).max(100),
  width: z.int().min(320).max(3_840),
  height: z.int().min(320).max(3_840),
  fps: framesPerSecondSchema,
});

export const updateProjectRequestSchema = z.strictObject({
  expectedDraftVersion: z.int().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  document: z.record(z.string(), z.unknown()),
});

export const listProjectsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['DRAFT', 'ARCHIVED']).optional(),
});

export const projectIdSchema = z.uuid('Must be a UUID');

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
