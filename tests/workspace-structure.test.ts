import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const expectedWorkspaces = [
  ['apps/web', '@hansys/web'],
  ['apps/worker', '@hansys/worker'],
  ['packages/database', '@hansys/database'],
  ['packages/project-schema', '@hansys/project-schema'],
  ['packages/shared', '@hansys/shared'],
  ['packages/storage', '@hansys/storage'],
  ['packages/template-registry', '@hansys/template-registry'],
  ['packages/ui', '@hansys/ui'],
  ['packages/video', '@hansys/video'],
] as const;

type WorkspacePackage = {
  name: string;
  private: boolean;
};

describe('workspace foundation', () => {
  it('declares the app and package workspace globs', () => {
    const workspaceDefinition = readFileSync(join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8');

    expect(workspaceDefinition).toContain('- apps/*');
    expect(workspaceDefinition).toContain('- packages/*');
  });

  it('contains uniquely named private workspace packages', () => {
    const packages = expectedWorkspaces.map(([directory, expectedName]) => {
      const manifest = JSON.parse(
        readFileSync(join(repositoryRoot, directory, 'package.json'), 'utf8'),
      ) as WorkspacePackage;

      expect(manifest.name).toBe(expectedName);
      expect(manifest.private).toBe(true);

      return manifest;
    });

    expect(new Set(packages.map(({ name }) => name)).size).toBe(packages.length);
  });

  it('makes every workspace inherit the strict TypeScript configuration', () => {
    const baseConfig = JSON.parse(
      readFileSync(join(repositoryRoot, 'tsconfig.base.json'), 'utf8'),
    ) as {
      compilerOptions?: { strict?: boolean };
    };

    expect(baseConfig.compilerOptions?.strict).toBe(true);

    for (const [directory] of expectedWorkspaces) {
      const workspaceConfig = JSON.parse(
        readFileSync(join(repositoryRoot, directory, 'tsconfig.json'), 'utf8'),
      ) as { extends?: string };

      expect(workspaceConfig.extends).toBe('../../tsconfig.base.json');
    }
  });
});
