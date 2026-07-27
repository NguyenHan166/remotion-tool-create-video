export type ProjectMigration = {
  readonly from: number;
  readonly to: number;
  readonly migrate: (input: unknown) => unknown;
};

export type ProjectDocumentMigratorOptions<TDocument> = {
  readonly currentVersion: number;
  readonly migrations: readonly ProjectMigration[];
  readonly parseCurrentDocument: (input: unknown) => TDocument;
};

export class InvalidProjectDocumentVersionError extends Error {
  readonly code = 'PROJECT_DOCUMENT_VERSION_INVALID';
  readonly path = 'schemaVersion';
  readonly receivedValue: unknown;

  constructor(receivedValue: unknown) {
    super('Project document schemaVersion must be a positive integer.');
    this.name = 'InvalidProjectDocumentVersionError';
    this.receivedValue = receivedValue;
  }
}

export class UnsupportedProjectDocumentVersionError extends Error {
  readonly code = 'PROJECT_DOCUMENT_VERSION_UNSUPPORTED';
  readonly version: number;
  readonly currentVersion: number;

  constructor(version: number, currentVersion: number) {
    super(
      `Project document schema version ${version} cannot be migrated to current version ${currentVersion}.`,
    );
    this.name = 'UnsupportedProjectDocumentVersionError';
    this.version = version;
    this.currentVersion = currentVersion;
  }
}

export class ProjectDocumentMigrationError extends Error {
  readonly code = 'PROJECT_DOCUMENT_MIGRATION_FAILED';
  readonly from: number;
  readonly to: number;

  constructor(from: number, to: number, message: string, cause?: unknown) {
    super(`Project document migration ${from} → ${to} failed: ${message}`, { cause });
    this.name = 'ProjectDocumentMigrationError';
    this.from = from;
    this.to = to;
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function readProjectDocumentVersion(input: unknown): number {
  const version =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>).schemaVersion
      : undefined;

  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    throw new InvalidProjectDocumentVersionError(version);
  }

  return version;
}

function createMigrationRegistry(
  currentVersion: number,
  migrations: readonly ProjectMigration[],
): ReadonlyMap<number, ProjectMigration> {
  const registry = new Map<number, ProjectMigration>();

  for (const migration of migrations) {
    assertPositiveInteger(migration.from, 'Migration from version');
    assertPositiveInteger(migration.to, 'Migration to version');

    if (migration.to !== migration.from + 1) {
      throw new RangeError(
        `Project document migrations must be sequential; received ${migration.from} → ${migration.to}`,
      );
    }

    if (migration.to > currentVersion) {
      throw new RangeError(
        `Project document migration ${migration.from} → ${migration.to} exceeds current version ${currentVersion}`,
      );
    }

    if (registry.has(migration.from)) {
      throw new RangeError(
        `Duplicate project document migration registered from version ${migration.from}`,
      );
    }

    registry.set(migration.from, migration);
  }

  return registry;
}

function runMigration(migration: ProjectMigration, input: unknown): unknown {
  let output: unknown;

  try {
    output = migration.migrate(structuredClone(input));
  } catch (cause) {
    throw new ProjectDocumentMigrationError(
      migration.from,
      migration.to,
      'migration function threw an error',
      cause,
    );
  }

  let outputVersion: number;

  try {
    outputVersion = readProjectDocumentVersion(output);
  } catch (cause) {
    throw new ProjectDocumentMigrationError(
      migration.from,
      migration.to,
      'output has an invalid schemaVersion',
      cause,
    );
  }

  if (outputVersion !== migration.to) {
    throw new ProjectDocumentMigrationError(
      migration.from,
      migration.to,
      `output schemaVersion is ${outputVersion}, expected ${migration.to}`,
    );
  }

  return output;
}

export function createProjectDocumentMigrator<TDocument>({
  currentVersion,
  migrations,
  parseCurrentDocument,
}: ProjectDocumentMigratorOptions<TDocument>): (input: unknown) => TDocument {
  assertPositiveInteger(currentVersion, 'Current project document version');

  const migrationRegistry = createMigrationRegistry(currentVersion, migrations);

  return (input: unknown): TDocument => {
    let version = readProjectDocumentVersion(input);

    if (version > currentVersion) {
      throw new UnsupportedProjectDocumentVersionError(version, currentVersion);
    }

    let migratedDocument = input;

    while (version < currentVersion) {
      const migration = migrationRegistry.get(version);

      if (migration === undefined) {
        throw new UnsupportedProjectDocumentVersionError(version, currentVersion);
      }

      migratedDocument = runMigration(migration, migratedDocument);
      version = migration.to;
    }

    return parseCurrentDocument(structuredClone(migratedDocument));
  };
}
