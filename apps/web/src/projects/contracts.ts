import { CaptionConfigV1Schema, PROJECT_SCENE_TYPES } from '@hansys/project-schema';
import { z } from 'zod';

const framesPerSecondSchema = z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]);

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

const rawScriptTextSchema = z
  .string()
  .max(100_000)
  .refine((value) => value.trim().length > 0, 'Must not be blank');
const scriptImportBaseShape = {
  rawText: rawScriptTextSchema,
  defaultSceneType: z.enum(PROJECT_SCENE_TYPES),
  defaultDurationInFrames: z.int().min(6),
};

export const scriptPreviewRequestSchema = z.discriminatedUnion('splitMode', [
  z.strictObject({
    ...scriptImportBaseShape,
    splitMode: z.literal('blank-line'),
    delimiter: z.string().max(100).optional(),
  }),
  z.strictObject({
    ...scriptImportBaseShape,
    splitMode: z.literal('delimiter'),
    delimiter: z
      .string()
      .max(100)
      .refine((value) => value.trim().length > 0, 'Must not be blank'),
  }),
  z.strictObject({
    ...scriptImportBaseShape,
    splitMode: z.literal('single'),
    delimiter: z.string().max(100).optional(),
  }),
]);

export const scriptSceneDraftSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  body: z
    .string()
    .max(5_000)
    .refine((value) => value.trim().length > 0, 'Must not be blank'),
  type: z.enum(PROJECT_SCENE_TYPES),
  durationInFrames: z.int().min(6),
});

export const scriptApplyRequestSchema = z.strictObject({
  expectedDraftVersion: z.int().min(1),
  scenes: z.array(scriptSceneDraftSchema).min(1).max(100),
});

export const updateCaptionsRequestSchema = z.strictObject({
  expectedDraftVersion: z.int().min(1),
  captions: CaptionConfigV1Schema,
});

export const importSrtVersionSchema = z.coerce.number().int().min(1);

export const listProjectsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['DRAFT', 'ARCHIVED']).optional(),
});

export const projectIdSchema = z.uuid('Must be a UUID');

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type ScriptPreviewRequest = z.infer<typeof scriptPreviewRequestSchema>;
export type ScriptApplyRequest = z.infer<typeof scriptApplyRequestSchema>;
export type UpdateCaptionsRequest = z.infer<typeof updateCaptionsRequestSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
