import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPoint = path.join(repositoryRoot, 'packages', 'video', 'src', 'index.ts');
const snapshotPath = path.join(
  repositoryRoot,
  'tests',
  'fixtures',
  'visual-regression',
  'approved.json',
);
const outputDirectory = path.join(repositoryRoot, 'test-results', 'visual-regression');
const sampleGridSize = 32;
const averageHashGridSize = 8;
const comparisonThresholds = {
  pixelTolerance: 12 / 255,
  maxMeanColorDistance: 0.025,
  maxChangedFraction: 0.18,
  maxAverageHashDistance: 16,
};
const frameCases = [
  {
    id: 'news-clean-v1',
    fixturePath: undefined,
    frames: [
      { name: 'start', frame: 0 },
      { name: 'midpoint', frame: 105 },
      { name: 'end', frame: 209 },
    ],
  },
  {
    id: 'breaking-red-v1',
    fixturePath: path.join(
      repositoryRoot,
      'packages',
      'video',
      'src',
      'templates',
      'breaking-red-v1',
      'fixture.json',
    ),
    frames: [
      { name: 'start', frame: 0 },
      { name: 'midpoint', frame: 60 },
      { name: 'end', frame: 119 },
    ],
  },
  {
    id: 'warning-dark-v1',
    fixturePath: path.join(
      repositoryRoot,
      'packages',
      'video',
      'src',
      'templates',
      'warning-dark-v1',
      'fixture.json',
    ),
    frames: [
      { name: 'start', frame: 0 },
      { name: 'midpoint', frame: 90 },
      { name: 'end', frame: 179 },
    ],
  },
];

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function getPnpmCommand() {
  const pnpmCliCandidate =
    process.platform === 'win32' && process.env.APPDATA !== undefined
      ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
      : undefined;
  const pnpmCli =
    pnpmCliCandidate !== undefined && existsSync(pnpmCliCandidate) ? pnpmCliCandidate : undefined;

  return {
    executable: pnpmCli === undefined ? 'pnpm' : process.execPath,
    arguments: pnpmCli === undefined ? [] : [pnpmCli],
  };
}

function getBrowserArgument() {
  const browserExecutable = [
    process.env.REMOTION_BROWSER_EXECUTABLE,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((candidate) => candidate !== undefined && existsSync(candidate));

  return browserExecutable === undefined ? [] : [`--browser-executable=${browserExecutable}`];
}

function renderFrame(template, frameCase, outputPath) {
  const pnpm = getPnpmCommand();
  const args = [
    ...pnpm.arguments,
    '--filter',
    '@hansys/video',
    'exec',
    'remotion',
    'still',
    entryPoint,
    'ProjectVideo',
    outputPath,
    `--frame=${frameCase.frame}`,
    '--overwrite',
    '--log=error',
    ...getBrowserArgument(),
  ];

  if (template.fixturePath !== undefined) {
    args.push(`--props=${template.fixturePath}`);
  }

  const result = spawnSync(pnpm.executable, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${template.id} ${frameCase.name} frame render failed.`);
  }
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }

  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePng(buffer) {
  if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error('Visual regression output is not a PNG file.');
  }

  let offset = pngSignature.length;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlaceMethod;
  const compressedData = [];

  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + chunkLength;

    if (chunkType === 'IHDR') {
      width = buffer.readUInt32BE(chunkDataStart);
      height = buffer.readUInt32BE(chunkDataStart + 4);
      bitDepth = buffer[chunkDataStart + 8];
      colorType = buffer[chunkDataStart + 9];
      interlaceMethod = buffer[chunkDataStart + 12];
    } else if (chunkType === 'IDAT') {
      compressedData.push(buffer.subarray(chunkDataStart, chunkDataEnd));
    } else if (chunkType === 'IEND') {
      break;
    }

    offset = chunkDataEnd + 4;
  }

  if (
    width === undefined ||
    height === undefined ||
    bitDepth === undefined ||
    colorType === undefined ||
    interlaceMethod === undefined
  ) {
    throw new Error('Visual regression PNG is missing its image header.');
  }

  if (bitDepth !== 8 || interlaceMethod !== 0 || ![0, 2, 4, 6].includes(colorType)) {
    throw new Error(
      `Unsupported visual regression PNG format (bit depth ${bitDepth}, color type ${colorType}, interlace ${interlaceMethod}).`,
    );
  }

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const bytesPerRow = width * channels;
  const inflated = inflateSync(Buffer.concat(compressedData));
  const pixels = Buffer.alloc(width * height * 4);
  let inputOffset = 0;
  let previousRow = Buffer.alloc(bytesPerRow);

  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[inputOffset];
    inputOffset += 1;
    const filteredRow = inflated.subarray(inputOffset, inputOffset + bytesPerRow);
    inputOffset += bytesPerRow;
    const row = Buffer.alloc(bytesPerRow);

    for (let x = 0; x < bytesPerRow; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const above = previousRow[x] ?? 0;
      const upperLeft = x >= channels ? (previousRow[x - channels] ?? 0) : 0;
      const filtered = filteredRow[x] ?? 0;

      row[x] =
        filterType === 0
          ? filtered
          : filterType === 1
            ? (filtered + left) & 0xff
            : filterType === 2
              ? (filtered + above) & 0xff
              : filterType === 3
                ? (filtered + Math.floor((left + above) / 2)) & 0xff
                : filterType === 4
                  ? (filtered + paethPredictor(left, above, upperLeft)) & 0xff
                  : (() => {
                      throw new Error(`Unsupported PNG row filter ${filterType}.`);
                    })();
    }

    for (let x = 0; x < width; x += 1) {
      const sourceOffset = x * channels;
      const targetOffset = (y * width + x) * 4;

      if (colorType === 0) {
        pixels[targetOffset] = row[sourceOffset];
        pixels[targetOffset + 1] = row[sourceOffset];
        pixels[targetOffset + 2] = row[sourceOffset];
        pixels[targetOffset + 3] = 255;
      } else if (colorType === 2) {
        pixels[targetOffset] = row[sourceOffset];
        pixels[targetOffset + 1] = row[sourceOffset + 1];
        pixels[targetOffset + 2] = row[sourceOffset + 2];
        pixels[targetOffset + 3] = 255;
      } else if (colorType === 4) {
        pixels[targetOffset] = row[sourceOffset];
        pixels[targetOffset + 1] = row[sourceOffset];
        pixels[targetOffset + 2] = row[sourceOffset];
        pixels[targetOffset + 3] = row[sourceOffset + 1];
      } else {
        pixels[targetOffset] = row[sourceOffset];
        pixels[targetOffset + 1] = row[sourceOffset + 1];
        pixels[targetOffset + 2] = row[sourceOffset + 2];
        pixels[targetOffset + 3] = row[sourceOffset + 3];
      }
    }

    previousRow = row;
  }

  return { width, height, pixels };
}

function samplePixels(image, gridSize) {
  const samples = Buffer.alloc(gridSize * gridSize * 4);
  let targetOffset = 0;

  for (let y = 0; y < gridSize; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor(((y + 0.5) * image.height) / gridSize));

    for (let x = 0; x < gridSize; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor(((x + 0.5) * image.width) / gridSize));
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      image.pixels.copy(samples, targetOffset, sourceOffset, sourceOffset + 4);
      targetOffset += 4;
    }
  }

  return samples;
}

function luminance(red, green, blue) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function calculateAverageHash(image) {
  const samples = samplePixels(image, averageHashGridSize);
  const values = [];
  let total = 0;

  for (let offset = 0; offset < samples.length; offset += 4) {
    const value = luminance(samples[offset], samples[offset + 1], samples[offset + 2]);
    values.push(value);
    total += value;
  }

  const average = total / values.length;
  let hash = 0n;

  for (const value of values) {
    hash = (hash << 1n) | (value >= average ? 1n : 0n);
  }

  return hash.toString(16).padStart(16, '0');
}

function createSignature(filePath) {
  const image = decodePng(readFileSync(filePath));
  const samples = samplePixels(image, sampleGridSize);

  return {
    width: image.width,
    height: image.height,
    sampleGridSize,
    averageHash: calculateAverageHash(image),
    samples: samples.toString('base64'),
    encodedSha256: createHash('sha256').update(readFileSync(filePath)).digest('hex'),
  };
}

function hammingDistance(left, right) {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;

  while (value !== 0n) {
    value &= value - 1n;
    distance += 1;
  }

  return distance;
}

function compareSignatures(expected, actual) {
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      pass: false,
      reason: `dimensions ${actual.width}x${actual.height} (expected ${expected.width}x${expected.height})`,
    };
  }

  if (expected.sampleGridSize !== actual.sampleGridSize) {
    return {
      pass: false,
      reason: `sample grid ${actual.sampleGridSize} (expected ${expected.sampleGridSize})`,
    };
  }

  const expectedSamples = Buffer.from(expected.samples, 'base64');
  const actualSamples = Buffer.from(actual.samples, 'base64');
  if (expectedSamples.length !== actualSamples.length) {
    return { pass: false, reason: 'perceptual sample length changed' };
  }

  let totalDistance = 0;
  let changedSamples = 0;

  for (let offset = 0; offset < expectedSamples.length; offset += 4) {
    const redDistance = Math.abs(expectedSamples[offset] - actualSamples[offset]);
    const greenDistance = Math.abs(expectedSamples[offset + 1] - actualSamples[offset + 1]);
    const blueDistance = Math.abs(expectedSamples[offset + 2] - actualSamples[offset + 2]);
    const alphaDistance = Math.abs(expectedSamples[offset + 3] - actualSamples[offset + 3]);
    const distance =
      (redDistance * 0.2126 + greenDistance * 0.7152 + blueDistance * 0.0722) / 255 +
      alphaDistance / 1020;

    totalDistance += distance;
    if (distance > comparisonThresholds.pixelTolerance) {
      changedSamples += 1;
    }
  }

  const sampleCount = expectedSamples.length / 4;
  const meanColorDistance = totalDistance / sampleCount;
  const changedFraction = changedSamples / sampleCount;
  const hashDistance = hammingDistance(expected.averageHash, actual.averageHash);
  const pass =
    meanColorDistance <= comparisonThresholds.maxMeanColorDistance &&
    changedFraction <= comparisonThresholds.maxChangedFraction &&
    hashDistance <= comparisonThresholds.maxAverageHashDistance;

  return {
    pass,
    reason: `mean ${(meanColorDistance * 100).toFixed(2)}%, changed ${(changedFraction * 100).toFixed(2)}%, average-hash distance ${hashDistance}`,
    meanColorDistance,
    changedFraction,
    hashDistance,
  };
}

function parseArguments() {
  const update = process.argv.includes('--update');
  const templateArgumentIndex = process.argv.indexOf('--template');
  const templateId =
    templateArgumentIndex === -1 ? undefined : process.argv[templateArgumentIndex + 1];

  if (templateArgumentIndex !== -1 && templateId === undefined) {
    throw new Error('Expected a template id after --template.');
  }

  return { update, templateId };
}

function readApprovedSnapshots() {
  if (!existsSync(snapshotPath)) {
    return {
      schemaVersion: 1,
      sampleGridSize,
      thresholds: comparisonThresholds,
      templates: {},
    };
  }

  return JSON.parse(readFileSync(snapshotPath, 'utf8'));
}

function writeApprovedSnapshots(snapshots) {
  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(snapshots, null, 2)}\n`);
}

function selectTemplates(templateId) {
  if (templateId === undefined) {
    return frameCases;
  }

  const selected = frameCases.filter((template) => template.id === templateId);
  if (selected.length === 0) {
    throw new Error(`Unknown visual regression template: ${templateId}.`);
  }

  return selected;
}

function run() {
  const { update, templateId } = parseArguments();
  const selectedTemplates = selectTemplates(templateId);
  const approvedSnapshots = readApprovedSnapshots();
  const failures = [];

  mkdirSync(outputDirectory, { recursive: true });

  for (const template of selectedTemplates) {
    const approvedTemplate = approvedSnapshots.templates?.[template.id];
    const nextFrames = {};

    for (const frameCase of template.frames) {
      const outputPath = path.join(outputDirectory, `${template.id}-${frameCase.name}.png`);
      renderFrame(template, frameCase, outputPath);
      const actualSignature = createSignature(outputPath);
      nextFrames[frameCase.name] = { frame: frameCase.frame, ...actualSignature };

      if (!update) {
        const expectedFrame = approvedTemplate?.frames?.[frameCase.name];
        if (expectedFrame === undefined) {
          failures.push(`${template.id}/${frameCase.name}: approved frame is missing`);
          continue;
        }

        const comparison = compareSignatures(expectedFrame, actualSignature);
        if (!comparison.pass) {
          failures.push(`${template.id}/${frameCase.name}: ${comparison.reason}`);
        }
      }
    }

    if (update) {
      approvedSnapshots.templates = {
        ...(approvedSnapshots.templates ?? {}),
        [template.id]: {
          frames: nextFrames,
        },
      };
    }
  }

  if (update) {
    approvedSnapshots.schemaVersion = 1;
    approvedSnapshots.sampleGridSize = sampleGridSize;
    approvedSnapshots.thresholds = comparisonThresholds;
    writeApprovedSnapshots(approvedSnapshots);
    process.stdout.write(`Updated visual regression snapshots at ${snapshotPath}\n`);
    return;
  }

  if (failures.length > 0) {
    process.stderr.write('Visual regression failed:\n');
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.stderr.write(
      'If the visual change is intentional, review the rendered frames and run pnpm test:visual:update.\n',
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Visual regression passed for ${selectedTemplates.length} template(s); approved frames are unchanged.\n`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
