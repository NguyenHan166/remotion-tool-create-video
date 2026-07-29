import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repositoryRoot, 'test-results', 'news-clean-v1');
const entryPoint = path.join(repositoryRoot, 'packages', 'video', 'src', 'index.ts');
const pnpmCliCandidate =
  process.platform === 'win32' && process.env.APPDATA !== undefined
    ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
    : undefined;
const pnpmCli =
  pnpmCliCandidate !== undefined && existsSync(pnpmCliCandidate) ? pnpmCliCandidate : undefined;
const pnpmExecutable = pnpmCli === undefined ? 'pnpm' : process.execPath;
const pnpmArguments = pnpmCli === undefined ? [] : [pnpmCli];
const browserExecutable = [
  process.env.REMOTION_BROWSER_EXECUTABLE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => candidate !== undefined && existsSync(candidate));
const frames = [
  { name: 'start', frame: 0 },
  { name: 'midpoint', frame: 105 },
  { name: 'end', frame: 209 },
];

mkdirSync(outputDirectory, { recursive: true });

for (const { name, frame } of frames) {
  const output = path.join(outputDirectory, `${name}.png`);
  const result = spawnSync(
    pnpmExecutable,
    [
      ...pnpmArguments,
      '--filter',
      '@hansys/video',
      'exec',
      'remotion',
      'still',
      entryPoint,
      'ProjectVideo',
      output,
      `--frame=${frame}`,
      '--overwrite',
      '--log=error',
      ...(browserExecutable === undefined ? [] : [`--browser-executable=${browserExecutable}`]),
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`news-clean-v1 ${name} frame smoke render failed.`);
  }
}

process.stdout.write(
  `Rendered ${frames.length} news-clean-v1 smoke frames to ${outputDirectory}\n`,
);
