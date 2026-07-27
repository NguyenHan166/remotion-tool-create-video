import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  InvalidProjectDocumentVersionError,
  ProjectDocumentMigrationError,
  UnsupportedProjectDocumentVersionError,
  createProjectDocumentMigrator,
  migrateProjectDocument,
  parseProjectDocument,
  type ProjectMigration,
} from '../packages/project-schema/src/index.js';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const exampleProject = JSON.parse(
  readFileSync(join(repositoryRoot, 'examples', 'project.example.json'), 'utf8'),
) as unknown;

type SyntheticProject = {
  schemaVersion: number;
  steps: string[];
  nested: {
    unchanged: boolean;
  };
};

function parseSyntheticV3(input: unknown): SyntheticProject {
  const candidate = input as Partial<SyntheticProject>;

  if (
    candidate.schemaVersion !== 3 ||
    !Array.isArray(candidate.steps) ||
    candidate.steps.join(',') !== 'v1-to-v2,v2-to-v3' ||
    candidate.nested?.unchanged !== true
  ) {
    throw new Error('Synthetic V3 validation failed');
  }

  return structuredClone(candidate as SyntheticProject);
}

describe('project document migration framework', () => {
  it('validates and returns a detached current-version document', () => {
    const migrated = migrateProjectDocument(exampleProject);
    const parsed = parseProjectDocument(exampleProject);

    expect(migrated).toEqual(parsed);
    expect(migrated.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(migrated).not.toBe(exampleProject);
    expect(migrated.scenes).not.toBe((exampleProject as { scenes: unknown[] }).scenes);
  });

  it('applies registered migrations sequentially without mutating the input', () => {
    const calls: number[] = [];
    const migrations: ProjectMigration[] = [
      {
        from: 2,
        to: 3,
        migrate: (input) => {
          const document = input as SyntheticProject;
          calls.push(2);
          document.schemaVersion = 3;
          document.steps.push('v2-to-v3');

          return document;
        },
      },
      {
        from: 1,
        to: 2,
        migrate: (input) => {
          const document = input as SyntheticProject;
          calls.push(1);
          document.schemaVersion = 2;
          document.steps.push('v1-to-v2');

          return document;
        },
      },
    ];
    const parseCurrentDocument = vi.fn(parseSyntheticV3);
    const migrate = createProjectDocumentMigrator({
      currentVersion: 3,
      migrations,
      parseCurrentDocument,
    });
    const original: SyntheticProject = {
      schemaVersion: 1,
      steps: [],
      nested: {
        unchanged: true,
      },
    };

    const migrated = migrate(original);

    expect(calls).toEqual([1, 2]);
    expect(migrated).toEqual({
      schemaVersion: 3,
      steps: ['v1-to-v2', 'v2-to-v3'],
      nested: {
        unchanged: true,
      },
    });
    expect(original).toEqual({
      schemaVersion: 1,
      steps: [],
      nested: {
        unchanged: true,
      },
    });
    expect(parseCurrentDocument).toHaveBeenCalledTimes(1);
  });

  it('throws a typed error for an unknown future version', () => {
    const unknownVersionDocument = {
      ...(exampleProject as Record<string, unknown>),
      schemaVersion: 99,
    };

    expect(() => migrateProjectDocument(unknownVersionDocument)).toThrow(
      UnsupportedProjectDocumentVersionError,
    );

    try {
      migrateProjectDocument(unknownVersionDocument);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'PROJECT_DOCUMENT_VERSION_UNSUPPORTED',
        version: 99,
        currentVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      });
    }
  });

  it('throws the unsupported-version error when a sequential migration is missing', () => {
    const migrate = createProjectDocumentMigrator({
      currentVersion: 3,
      migrations: [
        {
          from: 1,
          to: 2,
          migrate: (input) => ({
            ...(input as Record<string, unknown>),
            schemaVersion: 2,
          }),
        },
      ],
      parseCurrentDocument: parseSyntheticV3,
    });

    expect(() =>
      migrate({
        schemaVersion: 1,
        steps: [],
        nested: { unchanged: true },
      }),
    ).toThrow(UnsupportedProjectDocumentVersionError);
  });

  it.each([undefined, null, '1', 0, 1.5])(
    'rejects an invalid schemaVersion value: %s',
    (schemaVersion) => {
      expect(() => migrateProjectDocument({ schemaVersion })).toThrow(
        InvalidProjectDocumentVersionError,
      );
    },
  );

  it('rejects migrations that do not publish their expected next version', () => {
    const migrate = createProjectDocumentMigrator({
      currentVersion: 2,
      migrations: [
        {
          from: 1,
          to: 2,
          migrate: (input) => input,
        },
      ],
      parseCurrentDocument: (input) => input,
    });

    expect(() => migrate({ schemaVersion: 1 })).toThrow(ProjectDocumentMigrationError);
  });

  it('rejects non-sequential and duplicate migration registrations', () => {
    expect(() =>
      createProjectDocumentMigrator({
        currentVersion: 3,
        migrations: [
          {
            from: 1,
            to: 3,
            migrate: (input) => input,
          },
        ],
        parseCurrentDocument: (input) => input,
      }),
    ).toThrow(/must be sequential/);

    expect(() =>
      createProjectDocumentMigrator({
        currentVersion: 2,
        migrations: [
          {
            from: 1,
            to: 2,
            migrate: (input) => input,
          },
          {
            from: 1,
            to: 2,
            migrate: (input) => input,
          },
        ],
        parseCurrentDocument: (input) => input,
      }),
    ).toThrow(/Duplicate project document migration/);
  });
});
