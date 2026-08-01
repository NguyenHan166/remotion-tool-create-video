import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repositoryRoot, 'test-results', 'theme-fixture');
const entryPoint = path.join(repositoryRoot, 'packages', 'video', 'src', 'index.ts');
const logoAssetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const logoSource =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' rx='20' fill='%23F7C948'/%3E%3Cpath d='M48 18 79 74H17Z' fill='%23090A0F'/%3E%3C/svg%3E";
const captionDefaults = {
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
};
const templateFixtures = [
  {
    id: 'news-clean-v1',
    colors: {
      primaryColor: '#4F46E5',
      secondaryColor: '#E0E7FF',
      accentColor: '#DB2777',
      textColor: '#111827',
      mutedTextColor: '#4B5563',
    },
  },
  {
    id: 'breaking-red-v1',
    colors: {
      primaryColor: '#16A34A',
      secondaryColor: '#052E16',
      accentColor: '#FDE047',
      textColor: '#F0FDF4',
      mutedTextColor: '#BBF7D0',
    },
  },
  {
    id: 'warning-dark-v1',
    colors: {
      primaryColor: '#0EA5E9',
      secondaryColor: '#082F49',
      accentColor: '#FB923C',
      textColor: '#F0F9FF',
      mutedTextColor: '#BAE6FD',
    },
  },
];
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

mkdirSync(outputDirectory, { recursive: true });

for (const [index, fixture] of templateFixtures.entries()) {
  const project = {
    schemaVersion: 1,
    metadata: {
      title: `Theme fixture ${fixture.id}`,
      description: 'Shared theme fixture for template support.',
    },
    composition: {
      width: 1080,
      height: 1920,
      fps: 30,
      backgroundColor: fixture.colors.secondaryColor,
    },
    template: {
      id: fixture.id,
      version: 1,
    },
    theme: {
      ...fixture.colors,
      fontFamily: 'BeVietnamPro',
      logoAssetId,
      watermarkText: 'THEME FIXTURE',
      sourceText: 'HanSYS Theme Desk',
    },
    scenes: [
      {
        id: `${String(index + 1).repeat(8)}-${String(index + 1).repeat(4)}-4${String(index + 1).repeat(3)}-8${String(index + 1).repeat(3)}-${String(index + 1).repeat(12)}`,
        type: 'headline',
        name: 'Theme fixture headline',
        enabled: true,
        durationInFrames: 90,
        text: {
          label: 'THEME FIXTURE',
          headline: 'Logo, watermark và nguồn mặc định được render đồng nhất',
        },
        style: {
          textAlign: 'left',
          emphasis: 'strong',
        },
      },
    ],
    captions: captionDefaults,
  };
  const propsFile = path.join(outputDirectory, `${fixture.id}.json`);
  const output = path.join(outputDirectory, `${fixture.id}.png`);
  writeFileSync(
    propsFile,
    JSON.stringify(
      { project, assets: { [logoAssetId]: { id: logoAssetId, kind: 'LOGO', src: logoSource } } },
      null,
      2,
    ),
  );

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
      '--frame=45',
      `--props=${propsFile}`,
      '--overwrite',
      '--log=error',
      ...(browserExecutable === undefined ? [] : [`--browser-executable=${browserExecutable}`]),
    ],
    { cwd: repositoryRoot, encoding: 'utf8', stdio: 'inherit' },
  );

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${fixture.id} theme fixture render failed.`);
  }
}

process.stdout.write(
  `Rendered ${templateFixtures.length} templates with the shared theme fixture to ${outputDirectory}\n`,
);
