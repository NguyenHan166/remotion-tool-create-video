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

  it('ships one initial migration for every application table', () => {
    const migrationsRoot = join(databaseRoot, 'prisma', 'migrations');
    const migrationDirectories = readdirSync(migrationsRoot, {
      withFileTypes: true,
    }).filter((entry) => entry.isDirectory());

    expect(migrationDirectories).toHaveLength(1);

    const migrationSql = readFileSync(
      join(migrationsRoot, migrationDirectories[0]!.name, 'migration.sql'),
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
      expect(migrationSql).toContain(`CREATE TABLE "${table}"`);
    }
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
