import { initializeStorage } from '@hansys/storage';
import { createStructuredLogger } from '@hansys/shared/observability';
import { runStorageCleanup } from './cleanup.js';

type CleanupCliOptions = Readonly<{
  dryRun: boolean;
  json: boolean;
  retentionDays: number;
}>;

const DEFAULT_RETENTION_DAYS = 30;

function parseNonNegativeInteger(value: string, name: string): number {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe integer.`);
  }

  return parsed;
}

function parseOptions(argumentsList: readonly string[]): CleanupCliOptions | null {
  let dryRun = true;
  let json = false;
  let retentionDays = parseNonNegativeInteger(
    process.env.STORAGE_RETENTION_DAYS ?? String(DEFAULT_RETENTION_DAYS),
    'Storage retention days',
  );

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument === undefined) {
      break;
    }

    if (argument === '--help' || argument === '-h') {
      return null;
    }

    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (argument === '--execute') {
      dryRun = false;
      continue;
    }

    if (argument === '--json') {
      json = true;
      continue;
    }

    if (argument === '--retention-days') {
      const next = argumentsList[index + 1];

      if (next === undefined) {
        throw new Error('--retention-days requires a value.');
      }

      retentionDays = parseNonNegativeInteger(next, 'Storage retention days');
      index += 1;
      continue;
    }

    if (argument.startsWith('--retention-days=')) {
      retentionDays = parseNonNegativeInteger(
        argument.slice('--retention-days='.length),
        'Storage retention days',
      );
      continue;
    }

    throw new Error(`Unknown cleanup option: ${argument}`);
  }

  return { dryRun, json, retentionDays };
}

function printUsage(): void {
  console.log(`Usage: pnpm cleanup -- [options]

Options:
  --dry-run                 List files without deleting them (default)
  --execute                 Delete files that exceeded the retention period
  --retention-days <days>   Override STORAGE_RETENTION_DAYS
  --json                    Print a machine-readable summary
  --help                    Show this help
`);
}

const options = parseOptions(process.argv.slice(2));

if (options === null) {
  printUsage();
} else {
  const dataDirectory = process.env.DATA_DIR?.trim();

  if (dataDirectory === undefined || dataDirectory.length === 0) {
    console.error('DATA_DIR is required to run storage cleanup.');
    process.exitCode = 1;
  } else {
    try {
      const paths = await initializeStorage(dataDirectory);
      const result = await runStorageCleanup({
        paths,
        retentionDays: options.retentionDays,
        dryRun: options.dryRun,
        logger: createStructuredLogger({ sink: () => undefined }),
      });

      if (options.json) {
        console.log(JSON.stringify(result));
      } else {
        console.log(
          `${options.dryRun ? 'Dry run' : 'Cleanup'}: ${result.candidates.length} candidate(s), ` +
            `${result.deleted.length} deleted, ${result.deletedBytes} bytes reclaimed.`,
        );

        for (const candidate of result.candidates) {
          console.log(`- ${candidate.relativePath} (${candidate.sizeBytes} bytes)`);
        }
      }

      if (result.failures.length > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
