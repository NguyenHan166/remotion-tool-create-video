import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const targetVersion = '4.0.499';
const requiredPackages = [
  'remotion',
  '@remotion/player',
  '@remotion/renderer',
  '@remotion/bundler',
  '@remotion/captions',
];
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

const rootArgumentIndex = globalThis.process.argv.indexOf('--root');
const repositoryRoot =
  rootArgumentIndex === -1
    ? globalThis.process.cwd()
    : resolve(globalThis.process.argv[rootArgumentIndex + 1] ?? '');

const manifestPaths = [resolve(repositoryRoot, 'package.json')];

for (const workspaceGroup of ['apps', 'packages']) {
  const groupPath = resolve(repositoryRoot, workspaceGroup);

  if (!existsSync(groupPath)) {
    continue;
  }

  for (const entry of readdirSync(groupPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = resolve(groupPath, entry.name, 'package.json');

    if (existsSync(manifestPath)) {
      manifestPaths.push(manifestPath);
    }
  }
}

const errors = [];
const declaredRemotionPackages = new Set();

for (const manifestPath of manifestPaths) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  for (const dependencyField of dependencyFields) {
    const dependencies = manifest[dependencyField] ?? {};

    for (const [packageName, versionRange] of Object.entries(dependencies)) {
      if (packageName !== 'remotion' && !packageName.startsWith('@remotion/')) {
        continue;
      }

      declaredRemotionPackages.add(packageName);

      if (versionRange !== targetVersion) {
        errors.push(
          `${relative(repositoryRoot, manifestPath)}: ${packageName} must use exactly ` +
            `${targetVersion}; received ${String(versionRange)}`,
        );
      }
    }
  }
}

for (const packageName of requiredPackages) {
  if (!declaredRemotionPackages.has(packageName)) {
    errors.push(`Required package ${packageName} is not declared in any workspace manifest`);
  }
}

const lockfilePath = resolve(repositoryRoot, 'pnpm-lock.yaml');
const lockedRemotionPackages = new Set();

if (!existsSync(lockfilePath)) {
  errors.push('pnpm-lock.yaml is missing');
} else {
  const lockfile = readFileSync(lockfilePath, 'utf8');
  const lockEntryPattern = /^\s{2}['"]?(@remotion\/[^@'":\s]+|remotion)@([^'":(\s]+)/gm;

  for (const match of lockfile.matchAll(lockEntryPattern)) {
    const packageName = match[1];
    const lockedVersion = match[2];

    lockedRemotionPackages.add(packageName);

    if (lockedVersion !== targetVersion) {
      errors.push(
        `pnpm-lock.yaml: ${packageName} must resolve to ${targetVersion}; ` +
          `received ${lockedVersion}`,
      );
    }
  }
}

for (const packageName of requiredPackages) {
  if (!lockedRemotionPackages.has(packageName)) {
    errors.push(`Required package ${packageName} is missing from pnpm-lock.yaml`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    globalThis.console.error(`ERROR: ${error}`);
  }

  globalThis.process.exitCode = 1;
} else {
  globalThis.console.log(
    `All ${declaredRemotionPackages.size} declared and ${lockedRemotionPackages.size} locked ` +
      `Remotion packages use exactly ${targetVersion}.`,
  );
}
