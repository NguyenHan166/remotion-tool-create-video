import { createHash } from 'node:crypto';

function compareJsonKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function canonicalizeJsonValue(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Project document numbers must be finite');
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJsonValue).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => compareJsonKeys(left, right));

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizeJsonValue(entryValue)}`)
      .join(',')}}`;
  }

  throw new TypeError('Project document must contain only JSON values');
}

export function computeProjectContentHash(document: unknown): string {
  return createHash('sha256').update(canonicalizeJsonValue(document), 'utf8').digest('hex');
}
