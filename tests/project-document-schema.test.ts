import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  PROJECT_DOCUMENT_DEFAULTS,
  ProjectDocumentValidationError,
  generateProjectDocumentJsonSchema,
  parseProjectDocument,
  validateProjectDocument,
  type ProjectDocumentV1,
} from '../packages/project-schema/src/index.js';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const exampleProject = JSON.parse(
  readFileSync(join(repositoryRoot, 'examples', 'project.example.json'), 'utf8'),
) as unknown;

function cloneExampleProject(): ProjectDocumentV1 {
  return structuredClone(parseProjectDocument(exampleProject));
}

describe('ProjectDocument v1 schema', () => {
  it('validates the example project', () => {
    const result = validateProjectDocument(exampleProject);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
      expect(result.data.metadata.title.length).toBeGreaterThan(0);
      expect(result.data.scenes).toHaveLength(3);
    }
  });

  it('applies documented defaults to a minimal document', () => {
    const project = parseProjectDocument({
      schemaVersion: 1,
      metadata: {
        title: 'Minimal project',
      },
      template: {
        id: 'warning-dark-v1',
      },
      scenes: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          type: 'hook',
          name: 'Opening',
        },
      ],
    });

    expect(project).toMatchObject({
      composition: PROJECT_DOCUMENT_DEFAULTS.composition,
      template: {
        id: 'warning-dark-v1',
        version: 1,
      },
      theme: PROJECT_DOCUMENT_DEFAULTS.theme,
      scenes: [
        {
          enabled: true,
          durationInFrames: 150,
          text: {},
          style: PROJECT_DOCUMENT_DEFAULTS.scene.style,
        },
      ],
      audio: {},
      captions: PROJECT_DOCUMENT_DEFAULTS.captions,
      export: PROJECT_DOCUMENT_DEFAULTS.export,
    });
  });

  it.each([
    {
      name: 'short scene duration',
      mutate: (project: ProjectDocumentV1) => {
        project.scenes[0]!.durationInFrames = 5;
      },
      path: 'scenes.0.durationInFrames',
    },
    {
      name: 'transition longer than half the scene',
      mutate: (project: ProjectDocumentV1) => {
        project.scenes[0]!.transition = {
          type: 'fade',
          durationInFrames: 46,
        };
      },
      path: 'scenes.0.transition.durationInFrames',
    },
    {
      name: 'duplicate scene ID',
      mutate: (project: ProjectDocumentV1) => {
        project.scenes[1]!.id = project.scenes[0]!.id;
      },
      path: 'scenes.1.id',
    },
    {
      name: 'no enabled scenes',
      mutate: (project: ProjectDocumentV1) => {
        project.scenes.forEach((scene) => {
          scene.enabled = false;
        });
      },
      path: 'scenes',
    },
    {
      name: 'project longer than 180 seconds',
      mutate: (project: ProjectDocumentV1) => {
        project.scenes[0]!.durationInFrames = 5_401;
        project.scenes[1]!.enabled = false;
        project.scenes[2]!.enabled = false;
      },
      path: 'scenes',
    },
    {
      name: 'output path instead of a file name',
      mutate: (project: ProjectDocumentV1) => {
        project.export.fileName = 'C:\\renders\\output.mp4';
      },
      path: 'export.fileName',
    },
  ])('rejects $name and preserves the $path field path', ({ mutate, path }) => {
    const project = cloneExampleProject();
    mutate(project);

    const result = validateProjectDocument(project);

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path,
          }),
        ]),
      );
    }
  });

  it('validates caption order, entry timing and token boundaries with precise paths', () => {
    const project = cloneExampleProject();
    project.captions.entries = [
      {
        id: '44444444-4444-4444-8444-444444444444',
        startMs: 2_000,
        endMs: 3_000,
        text: 'First',
        tokens: [
          {
            text: 'First',
            startMs: 1_999,
            endMs: 3_001,
          },
        ],
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        startMs: 1_000,
        endMs: 1_000,
        text: 'Second',
      },
    ];

    const result = validateProjectDocument(project);

    expect(result).toMatchObject({
      success: false,
      details: expect.arrayContaining([
        expect.objectContaining({ path: 'captions.entries.0.tokens.0' }),
        expect.objectContaining({ path: 'captions.entries.1.endMs' }),
        expect.objectContaining({ path: 'captions.entries.1.startMs' }),
      ]),
    });
  });

  it('accepts overlapping captions with a field-specific warning', () => {
    const project = cloneExampleProject();
    project.captions.entries = [
      {
        id: '44444444-4444-4444-8444-444444444444',
        startMs: 0,
        endMs: 2_000,
        text: 'First',
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        startMs: 1_500,
        endMs: 3_000,
        text: 'Second',
      },
    ];

    const result = validateProjectDocument(project);

    expect(result).toMatchObject({
      success: true,
      warnings: [
        {
          code: 'CAPTION_OVERLAP',
          path: 'captions.entries.1.startMs',
        },
      ],
    });
  });

  it('rejects unsupported schema versions with the version field path', () => {
    const project = {
      ...cloneExampleProject(),
      schemaVersion: 2,
    };

    const result = validateProjectDocument(project);

    expect(result).toMatchObject({
      success: false,
      details: [expect.objectContaining({ path: 'schemaVersion' })],
    });
  });

  it('throws a typed validation error with API-compatible details', () => {
    const project = cloneExampleProject();
    project.metadata.title = '';

    expect(() => parseProjectDocument(project)).toThrow(ProjectDocumentValidationError);

    try {
      parseProjectDocument(project);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'PROJECT_VALIDATION_FAILED',
        message: 'Project document is invalid.',
        details: [
          expect.objectContaining({
            path: 'metadata.title',
          }),
        ],
      });
    }
  });

  it('generates the committed JSON Schema from the Zod output contract', () => {
    const committedSchema = JSON.parse(
      readFileSync(join(repositoryRoot, 'schemas', 'project.schema.json'), 'utf8'),
    ) as unknown;
    const generatedSchema = generateProjectDocumentJsonSchema();

    expect(generatedSchema).toEqual(committedSchema);
    expect(generatedSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://hansys.local/schemas/project-v1.json',
      title: 'HanSYS ProjectDocument v1',
      type: 'object',
    });
  });
});
