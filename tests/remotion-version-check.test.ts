import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const checkerPath = join(repositoryRoot, 'scripts', 'check-remotion-versions.mjs');
const temporaryDirectories: string[] = [];

const requiredVersions = {
  remotion: '4.0.499',
  '@remotion/player': '4.0.499',
  '@remotion/renderer': '4.0.499',
  '@remotion/bundler': '4.0.499',
  '@remotion/captions': '4.0.499',
};

function createFixture(
  dependencyOverrides: Record<string, string> = {},
  lockfileOverrides: Record<string, string> = {},
): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'hansys-remotion-versions-'));
  temporaryDirectories.push(fixtureRoot);

  const dependencies = { ...requiredVersions, ...dependencyOverrides };

  writeFileSync(
    join(fixtureRoot, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true, dependencies }),
  );

  const lockEntries = Object.entries({ ...requiredVersions, ...lockfileOverrides })
    .map(([packageName, version]) => `  '${packageName}@${version}': {}`)
    .join('\n');

  writeFileSync(
    join(fixtureRoot, 'pnpm-lock.yaml'),
    `lockfileVersion: '9.0'\npackages:\n${lockEntries}\n`,
  );

  return fixtureRoot;
}

function runChecker(root: string) {
  return spawnSync(process.execPath, [checkerPath, '--root', root], {
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('Remotion version checker', () => {
  it('accepts the repository manifests and lockfile', () => {
    const result = runChecker(repositoryRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(
      /All 5 declared and \d+ locked Remotion packages use exactly 4\.0\.499\./,
    );
  });

  it.each(['^4.0.499', '~4.0.499', '4.0.498'])(
    'rejects the manifest version %s',
    (invalidVersion) => {
      const fixtureRoot = createFixture({ remotion: invalidVersion });
      const result = runChecker(fixtureRoot);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `remotion must use exactly 4.0.499; received ${invalidVersion}`,
      );
    },
  );

  it('rejects a divergent Remotion version in the lockfile', () => {
    const fixtureRoot = createFixture({}, { '@remotion/player': '4.0.498' });
    const result = runChecker(fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('@remotion/player must resolve to 4.0.499; received 4.0.498');
  });
});
