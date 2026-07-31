import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const databaseRoot = join(repositoryRoot, 'packages', 'database');

describe('database foundation', () => {
  it('uses PostgreSQL and the current Prisma client generator', () => {
    const schema = readFileSync(join(databaseRoot, 'prisma', 'schema.prisma'), 'utf8');

    expect(schema).toContain('provider = "prisma-client"');
    expect(schema).toContain('provider = "postgresql"');
    expect(schema).not.toContain('url      = env("DATABASE_URL")');
  });

  it('contains the complete initial data model', () => {
    const schema = readFileSync(join(databaseRoot, 'prisma', 'schema.prisma'), 'utf8');
    const expectedModels = [
      'Project',
      'ProjectRevision',
      'Asset',
      'ProjectAsset',
      'RevisionAsset',
      'RenderJob',
      'RenderOutput',
      'WorkerHeartbeat',
      'AppSetting',
      'IdempotencyRecord',
    ];

    for (const model of expectedModels) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it('keeps the initial migration intact and applies render hardening forward', () => {
    const migrationsRoot = join(databaseRoot, 'prisma', 'migrations');
    const migrationDirectories = readdirSync(migrationsRoot, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));

    const initialMigration = migrationDirectories.find(
      (entry) => entry.name === '20260727130652_init',
    );
    const renderMigration = migrationDirectories.find(
      (entry) => entry.name === '20260731100000_render_job_invariants',
    );

    expect(initialMigration).toBeDefined();
    expect(renderMigration).toBeDefined();

    const initialMigrationSql = readFileSync(
      join(migrationsRoot, initialMigration!.name, 'migration.sql'),
      'utf8',
    );
    const expectedTables = [
      'Project',
      'ProjectRevision',
      'Asset',
      'ProjectAsset',
      'RevisionAsset',
      'RenderJob',
      'RenderOutput',
      'WorkerHeartbeat',
      'AppSetting',
      'IdempotencyRecord',
    ];

    for (const table of expectedTables) {
      expect(initialMigrationSql).toContain(`CREATE TABLE "${table}"`);
    }

    const renderMigrationSql = readFileSync(
      join(migrationsRoot, renderMigration!.name, 'migration.sql'),
      'utf8',
    );

    expect(renderMigrationSql).not.toContain('CREATE TABLE');
    expect(renderMigrationSql).toContain('ALTER TABLE "RenderJob"');
    expect(renderMigrationSql).toContain('ALTER TABLE "RenderOutput"');
    expect(renderMigrationSql).toContain('"RenderJob_progress_check"');
    expect(renderMigrationSql).toContain('"RenderJob_status_heartbeatAt_idx"');
  });

  it('pins compatible Prisma packages to one version', () => {
    const manifest = JSON.parse(readFileSync(join(databaseRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(manifest.dependencies['@prisma/client']).toBe('7.9.0');
    expect(manifest.dependencies['@prisma/adapter-pg']).toBe('7.9.0');
    expect(manifest.devDependencies.prisma).toBe('7.9.0');
  });

  it('provides a PostgreSQL 16 development service', () => {
    const compose = readFileSync(join(repositoryRoot, 'docker', 'compose.dev.yaml'), 'utf8');

    expect(compose).toContain('image: postgres:16');
    expect(compose).toContain('pg_isready');
    expect(compose).toContain('postgres_dev_data:/var/lib/postgresql/data');
  });
});
