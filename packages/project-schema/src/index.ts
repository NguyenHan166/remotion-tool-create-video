import { z, type ZodError, type ZodIssue } from 'zod';
import { createProjectDocumentMigrator, type ProjectMigration } from './migration.js';

export {
  InvalidProjectDocumentVersionError,
  ProjectDocumentMigrationError,
  UnsupportedProjectDocumentVersionError,
  createProjectDocumentMigrator,
  type ProjectDocumentMigratorOptions,
  type ProjectMigration,
} from './migration.js';

export const CURRENT_PROJECT_SCHEMA_VERSION = 1 as const;
export const MAX_PROJECT_DURATION_SECONDS = 180;
export const PROJECT_SCENE_TYPES = [
  'hook',
  'headline',
  'content',
  'image',
  'video',
  'bullet-list',
  'quote',
  'outro',
] as const;

const DEFAULT_COMPOSITION = {
  width: 1080,
  height: 1920,
  fps: 30,
  backgroundColor: '#090B10',
} as const;

const DEFAULT_THEME = {
  primaryColor: '#D71920',
  secondaryColor: '#151922',
  accentColor: '#F7C948',
  textColor: '#FFFFFF',
  mutedTextColor: '#C6CBD4',
  fontFamily: 'BeVietnamPro',
} as const;

const DEFAULT_SCENE_STYLE = {
  textAlign: 'center',
  emphasis: 'normal',
} as const;

const DEFAULT_CAPTIONS = {
  enabled: false,
  source: 'none',
  style: 'clean',
  entries: [],
  options: {
    maxWordsPerPage: 6,
    highlightCurrentWord: false,
    position: 'bottom',
    fontSize: 58,
  },
} as const;

const DEFAULT_EXPORT = {
  preset: 'vertical-h264',
  codec: 'h264',
  muted: false,
} as const;

export const PROJECT_DOCUMENT_DEFAULTS = Object.freeze({
  composition: DEFAULT_COMPOSITION,
  theme: DEFAULT_THEME,
  scene: {
    enabled: true,
    durationInFrames: 150,
    text: {},
    style: DEFAULT_SCENE_STYLE,
  },
  audio: {},
  captions: DEFAULT_CAPTIONS,
  export: DEFAULT_EXPORT,
});

const hexColorSchema = z
  .string()
  .regex(/^#[\dA-Fa-f]{6}(?:[\dA-Fa-f]{2})?$/, 'Must be a six- or eight-digit hex color');
const assetIdSchema = z.uuid('Must be a UUID');
const framesPerSecondSchema = z.literal([24, 25, 30, 50, 60]);
const nonBlankString = (maximumLength: number) =>
  z.string().trim().min(1, 'Must not be blank').max(maximumLength);

export const TransitionV1Schema = z.strictObject({
  type: z.enum(['none', 'fade', 'slide-left', 'slide-up']),
  durationInFrames: z.int().min(0),
});

export const MediaV1Schema = z.strictObject({
  assetId: assetIdSchema,
  fit: z.enum(['cover', 'contain']),
  positionX: z.number().min(0).max(1),
  positionY: z.number().min(0).max(1),
  scale: z.number().min(0.1).max(5),
  startFromMs: z.int().min(0),
  playbackRate: z.number().min(0.25).max(4),
  muted: z.boolean(),
});

export const SceneV1Schema = z
  .strictObject({
    id: z.uuid('Must be a UUID'),
    type: z.enum(PROJECT_SCENE_TYPES),
    name: nonBlankString(200),
    enabled: z.boolean().default(PROJECT_DOCUMENT_DEFAULTS.scene.enabled),
    durationInFrames: z.int().min(6).default(PROJECT_DOCUMENT_DEFAULTS.scene.durationInFrames),
    transition: TransitionV1Schema.optional(),
    text: z
      .strictObject({
        label: z.string().max(200).optional(),
        headline: z.string().max(300).optional(),
        body: z.string().max(5_000).optional(),
        source: z.string().max(500).optional(),
        quoteAuthor: z.string().max(200).optional(),
        bullets: z.array(z.string().max(240)).max(10).optional(),
      })
      .default(() => ({})),
    media: MediaV1Schema.optional(),
    style: z
      .strictObject({
        variant: z.string().max(100).optional(),
        textAlign: z
          .enum(['left', 'center', 'right'])
          .default(PROJECT_DOCUMENT_DEFAULTS.scene.style.textAlign),
        emphasis: z
          .enum(['normal', 'strong', 'urgent'])
          .default(PROJECT_DOCUMENT_DEFAULTS.scene.style.emphasis),
      })
      .default(() => ({ ...PROJECT_DOCUMENT_DEFAULTS.scene.style })),
  })
  .superRefine((scene, context) => {
    if (
      scene.transition !== undefined &&
      scene.transition.durationInFrames > scene.durationInFrames / 2
    ) {
      context.addIssue({
        code: 'custom',
        path: ['transition', 'durationInFrames'],
        message: 'Must not exceed half of the scene duration',
      });
    }
  });

export const AudioTrackV1Schema = z.strictObject({
  assetId: assetIdSchema,
  volume: z.number().min(0).max(1),
  startAtFrame: z.int().min(0),
});

export const BackgroundMusicTrackV1Schema = AudioTrackV1Schema.extend({
  loop: z.boolean(),
  fadeInFrames: z.int().min(0),
  fadeOutFrames: z.int().min(0),
});

export const CaptionTokenV1Schema = z.strictObject({
  text: nonBlankString(1_000),
  startMs: z.int().min(0),
  endMs: z.int().min(1),
});

export const CaptionEntryV1Schema = z
  .strictObject({
    id: z.uuid('Must be a UUID'),
    startMs: z.int().min(0),
    endMs: z.int().min(1),
    text: nonBlankString(1_000),
    tokens: z.array(CaptionTokenV1Schema).optional(),
  })
  .superRefine((entry, context) => {
    if (entry.endMs <= entry.startMs) {
      context.addIssue({
        code: 'custom',
        path: ['endMs'],
        message: 'Must be greater than startMs',
      });
    }

    entry.tokens?.forEach((token, tokenIndex) => {
      if (token.endMs <= token.startMs) {
        context.addIssue({
          code: 'custom',
          path: ['tokens', tokenIndex, 'endMs'],
          message: 'Must be greater than token startMs',
        });
      }

      if (token.startMs < entry.startMs || token.endMs > entry.endMs) {
        context.addIssue({
          code: 'custom',
          path: ['tokens', tokenIndex],
          message: 'Token timing must remain inside its caption entry',
        });
      }
    });
  });

export const CaptionConfigV1Schema = z
  .strictObject({
    enabled: z.boolean(),
    source: z.enum(['none', 'manual', 'srt']),
    style: z.enum(['clean', 'tiktok', 'news']),
    entries: z.array(CaptionEntryV1Schema),
    options: z.strictObject({
      maxWordsPerPage: z.int().min(1).max(20),
      highlightCurrentWord: z.boolean(),
      position: z.enum(['top', 'center', 'bottom']),
      fontSize: z.number().min(12).max(200),
    }),
  })
  .superRefine((captions, context) => {
    for (let index = 1; index < captions.entries.length; index += 1) {
      const previousEntry = captions.entries[index - 1]!;
      const currentEntry = captions.entries[index]!;

      if (currentEntry.startMs < previousEntry.startMs) {
        context.addIssue({
          code: 'custom',
          path: ['entries', index, 'startMs'],
          message: 'Caption entries must be sorted by startMs',
        });
      }
    }
  });

export const ExportConfigV1Schema = z.strictObject({
  preset: z.enum(['draft', 'vertical-h264', 'vertical-high']),
  codec: z.literal('h264'),
  muted: z.boolean(),
  fileName: nonBlankString(200)
    .regex(/^[^/\\]+$/, 'Must be a file name, not a path')
    .optional(),
});

export const ProjectDocumentV1Schema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_PROJECT_SCHEMA_VERSION),
    metadata: z.strictObject({
      title: nonBlankString(200),
      description: z.string().max(5_000).optional(),
    }),
    composition: z
      .strictObject({
        width: z.int().min(320).max(3_840).default(DEFAULT_COMPOSITION.width),
        height: z.int().min(320).max(3_840).default(DEFAULT_COMPOSITION.height),
        fps: framesPerSecondSchema.default(DEFAULT_COMPOSITION.fps),
        backgroundColor: hexColorSchema.default(DEFAULT_COMPOSITION.backgroundColor),
      })
      .default(() => ({ ...DEFAULT_COMPOSITION })),
    template: z.strictObject({
      id: nonBlankString(100),
      version: z.int().min(1).default(1),
    }),
    theme: z
      .strictObject({
        primaryColor: z.string().default(DEFAULT_THEME.primaryColor),
        secondaryColor: z.string().default(DEFAULT_THEME.secondaryColor),
        accentColor: z.string().default(DEFAULT_THEME.accentColor),
        textColor: z.string().default(DEFAULT_THEME.textColor),
        mutedTextColor: z.string().default(DEFAULT_THEME.mutedTextColor),
        fontFamily: z.enum(['BeVietnamPro', 'Inter', 'NotoSans']).default(DEFAULT_THEME.fontFamily),
        logoAssetId: assetIdSchema.optional(),
        watermarkText: z.string().max(200).optional(),
      })
      .default(() => ({ ...DEFAULT_THEME })),
    scenes: z.array(SceneV1Schema).min(1).max(100),
    audio: z
      .strictObject({
        voiceover: AudioTrackV1Schema.optional(),
        backgroundMusic: BackgroundMusicTrackV1Schema.optional(),
      })
      .default(() => ({})),
    captions: CaptionConfigV1Schema.default(() => ({
      ...DEFAULT_CAPTIONS,
      entries: [],
      options: { ...DEFAULT_CAPTIONS.options },
    })),
    export: ExportConfigV1Schema.default(() => ({ ...DEFAULT_EXPORT })),
  })
  .superRefine((project, context) => {
    const seenSceneIds = new Set<string>();
    let enabledSceneCount = 0;
    let totalDurationInFrames = 0;

    project.scenes.forEach((scene, sceneIndex) => {
      if (seenSceneIds.has(scene.id)) {
        context.addIssue({
          code: 'custom',
          path: ['scenes', sceneIndex, 'id'],
          message: 'Scene IDs must be unique',
        });
      }

      seenSceneIds.add(scene.id);

      if (scene.enabled) {
        enabledSceneCount += 1;
        totalDurationInFrames += scene.durationInFrames;
      }
    });

    if (enabledSceneCount === 0) {
      context.addIssue({
        code: 'custom',
        path: ['scenes'],
        message: 'At least one scene must be enabled',
      });
    }

    if (totalDurationInFrames / project.composition.fps > MAX_PROJECT_DURATION_SECONDS) {
      context.addIssue({
        code: 'custom',
        path: ['scenes'],
        message: `Enabled scenes must not exceed ${MAX_PROJECT_DURATION_SECONDS} seconds`,
      });
    }
  });

export const ProjectDocumentSchema = ProjectDocumentV1Schema;

export type TransitionV1 = z.infer<typeof TransitionV1Schema>;
export type MediaV1 = z.infer<typeof MediaV1Schema>;
export type SceneV1 = z.infer<typeof SceneV1Schema>;
export type AudioTrackV1 = z.infer<typeof AudioTrackV1Schema>;
export type BackgroundMusicTrackV1 = z.infer<typeof BackgroundMusicTrackV1Schema>;
export type CaptionTokenV1 = z.infer<typeof CaptionTokenV1Schema>;
export type CaptionEntryV1 = z.infer<typeof CaptionEntryV1Schema>;
export type CaptionConfigV1 = z.infer<typeof CaptionConfigV1Schema>;
export type ExportConfigV1 = z.infer<typeof ExportConfigV1Schema>;
export type ProjectDocumentV1 = z.infer<typeof ProjectDocumentV1Schema>;
export type ProjectDocumentV1Input = z.input<typeof ProjectDocumentV1Schema>;

export type ProjectValidationDetail = {
  path: string;
  message: string;
};

export type ProjectValidationWarning = ProjectValidationDetail & {
  code: 'CAPTION_OVERLAP';
};

export type ProjectValidationResult =
  | {
      success: true;
      data: ProjectDocumentV1;
      warnings: ProjectValidationWarning[];
    }
  | {
      success: false;
      details: ProjectValidationDetail[];
      warnings: ProjectValidationWarning[];
    };

function formatIssuePath(issue: ZodIssue): string {
  return issue.path.length === 0 ? 'document' : issue.path.map(String).join('.');
}

export function mapProjectValidationError(
  error: ZodError<ProjectDocumentV1Input>,
): ProjectValidationDetail[] {
  return error.issues.map((issue) => ({
    path: formatIssuePath(issue),
    message: issue.message,
  }));
}

export class ProjectDocumentValidationError extends Error {
  readonly code = 'PROJECT_VALIDATION_FAILED';
  readonly details: readonly ProjectValidationDetail[];

  constructor(details: readonly ProjectValidationDetail[]) {
    super('Project document is invalid.');
    this.name = 'ProjectDocumentValidationError';
    this.details = details;
  }
}

function getProjectValidationWarnings(project: ProjectDocumentV1): ProjectValidationWarning[] {
  const warnings: ProjectValidationWarning[] = [];

  for (let index = 1; index < project.captions.entries.length; index += 1) {
    const previousEntry = project.captions.entries[index - 1]!;
    const currentEntry = project.captions.entries[index]!;

    if (currentEntry.startMs < previousEntry.endMs) {
      warnings.push({
        code: 'CAPTION_OVERLAP',
        path: `captions.entries.${index}.startMs`,
        message: 'Caption entry overlaps the previous entry',
      });
    }
  }

  return warnings;
}

export function validateProjectDocument(input: unknown): ProjectValidationResult {
  const result = ProjectDocumentV1Schema.safeParse(input);

  if (result.success) {
    return {
      ...result,
      warnings: getProjectValidationWarnings(result.data),
    };
  }

  return {
    success: false,
    details: mapProjectValidationError(result.error),
    warnings: [],
  };
}

export function parseProjectDocument(input: unknown): ProjectDocumentV1 {
  const result = validateProjectDocument(input);

  if (!result.success) {
    throw new ProjectDocumentValidationError(result.details);
  }

  return result.data;
}

export function extractProjectAssetIds(project: ProjectDocumentV1): string[] {
  const assetIds = [
    project.theme.logoAssetId,
    ...project.scenes.map((scene) => scene.media?.assetId),
    project.audio.voiceover?.assetId,
    project.audio.backgroundMusic?.assetId,
  ];

  return [...new Set(assetIds.filter((assetId): assetId is string => assetId !== undefined))];
}

export {
  splitScriptIntoSceneDrafts,
  type ScriptSceneDraft,
  type ScriptSplitInput,
  type ScriptSplitMode,
  type ScriptSplitPreview,
} from './script-splitting.js';

export const PROJECT_DOCUMENT_MIGRATIONS: readonly ProjectMigration[] = Object.freeze([]);

const migrateToCurrentProjectDocument = createProjectDocumentMigrator({
  currentVersion: CURRENT_PROJECT_SCHEMA_VERSION,
  migrations: PROJECT_DOCUMENT_MIGRATIONS,
  parseCurrentDocument: parseProjectDocument,
});

export function migrateProjectDocument(input: unknown): ProjectDocumentV1 {
  return migrateToCurrentProjectDocument(input);
}

export type ProjectDocumentJsonSchema = Record<string, unknown>;

export function generateProjectDocumentJsonSchema(): ProjectDocumentJsonSchema {
  const generatedSchema = z.toJSONSchema(ProjectDocumentV1Schema, {
    io: 'output',
    target: 'draft-2020-12',
  }) as ProjectDocumentJsonSchema;

  return {
    ...generatedSchema,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://hansys.local/schemas/project-v1.json',
    title: 'HanSYS ProjectDocument v1',
  };
}
