export const MAX_SRT_CHARACTERS = 2_000_000;
export const MAX_SRT_CUES = 10_000;

export type SrtCue = Readonly<{
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}>;

export type SrtParseWarning = Readonly<{
  code: 'SRT_OVERLAP';
  cueIndex: number;
  message: string;
}>;

export type SrtParseDetail = Readonly<{
  block: number;
  line: number;
  message: string;
}>;

export type SrtParseResult = Readonly<{
  cues: readonly SrtCue[];
  warnings: readonly SrtParseWarning[];
}>;

export class SrtParseError extends Error {
  readonly code = 'SRT_INVALID';
  readonly details: readonly SrtParseDetail[];

  constructor(details: readonly SrtParseDetail[]) {
    super('SRT subtitle content is invalid.');
    this.name = 'SrtParseError';
    this.details = details;
  }
}

type SrtBlock = Readonly<{
  number: number;
  startLine: number;
  lines: readonly string[];
}>;

const timingPattern =
  /^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})\s*-->\s*(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})(?:\s+.*)?$/u;

function splitBlocks(source: string): SrtBlock[] {
  const lines = source
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n')
    .split('\n');
  const blocks: SrtBlock[] = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    while (lineIndex < lines.length && lines[lineIndex]?.trim().length === 0) {
      lineIndex += 1;
    }

    if (lineIndex >= lines.length) {
      break;
    }

    const startLine = lineIndex + 1;
    const blockLines: string[] = [];

    while (lineIndex < lines.length && lines[lineIndex]?.trim().length !== 0) {
      blockLines.push(lines[lineIndex] ?? '');
      lineIndex += 1;
    }

    blocks.push({
      number: blocks.length + 1,
      startLine,
      lines: blockLines,
    });
  }

  return blocks;
}

function timestampToMilliseconds(parts: readonly string[]): number {
  const [hours, minutes, seconds, milliseconds] = parts.map(Number);

  return (
    ((hours ?? 0) * 60 * 60 + (minutes ?? 0) * 60 + (seconds ?? 0)) * 1_000 + (milliseconds ?? 0)
  );
}

function parseTiming(line: string): { startMs: number; endMs: number } | null {
  const match = timingPattern.exec(line.trim());

  if (match === null) {
    return null;
  }

  return {
    startMs: timestampToMilliseconds(match.slice(1, 5)),
    endMs: timestampToMilliseconds(match.slice(5, 9)),
  };
}

export function parseSrt(source: string): SrtParseResult {
  if (source.length > MAX_SRT_CHARACTERS) {
    throw new SrtParseError([
      {
        block: 0,
        line: 1,
        message: `SRT content must not exceed ${MAX_SRT_CHARACTERS} characters.`,
      },
    ]);
  }

  if (source.includes('\0')) {
    throw new SrtParseError([
      { block: 0, line: 1, message: 'SRT content must not contain NUL bytes.' },
    ]);
  }

  const blocks = splitBlocks(source);

  if (blocks.length === 0) {
    throw new SrtParseError([{ block: 0, line: 1, message: 'SRT content must not be empty.' }]);
  }

  if (blocks.length > MAX_SRT_CUES) {
    throw new SrtParseError([
      {
        block: MAX_SRT_CUES + 1,
        line: blocks[MAX_SRT_CUES]?.startLine ?? 1,
        message: `SRT content must not exceed ${MAX_SRT_CUES} cues.`,
      },
    ]);
  }

  const details: SrtParseDetail[] = [];
  const cues: SrtCue[] = [];
  const seenIndices = new Set<number>();

  for (const block of blocks) {
    const indexText = block.lines[0]?.trim() ?? '';
    const index = /^\d+$/u.test(indexText) ? Number(indexText) : Number.NaN;
    const timing = parseTiming(block.lines[1] ?? '');
    const text = block.lines.slice(2).join('\n').trim();

    if (!Number.isSafeInteger(index) || index <= 0) {
      details.push({
        block: block.number,
        line: block.startLine,
        message: 'Cue index must be a positive integer.',
      });
    } else if (seenIndices.has(index)) {
      details.push({
        block: block.number,
        line: block.startLine,
        message: `Cue index ${index} is duplicated.`,
      });
    } else {
      seenIndices.add(index);
    }

    if (timing === null) {
      details.push({
        block: block.number,
        line: block.startLine + 1,
        message: 'Timing must use HH:MM:SS,mmm --> HH:MM:SS,mmm.',
      });
    } else if (timing.endMs <= timing.startMs) {
      details.push({
        block: block.number,
        line: block.startLine + 1,
        message: 'Cue end time must be greater than its start time.',
      });
    }

    if (text.length === 0) {
      details.push({
        block: block.number,
        line: block.startLine + 2,
        message: 'Cue text must not be blank.',
      });
    } else if (text.length > 1_000) {
      details.push({
        block: block.number,
        line: block.startLine + 2,
        message: 'Cue text must not exceed 1000 characters.',
      });
    }

    if (
      Number.isSafeInteger(index) &&
      index > 0 &&
      timing !== null &&
      timing.endMs > timing.startMs &&
      text.length > 0 &&
      text.length <= 1_000
    ) {
      cues.push({ index, ...timing, text });
    }
  }

  for (let index = 1; index < cues.length; index += 1) {
    if (cues[index]!.startMs < cues[index - 1]!.startMs) {
      const block = blocks[index]!;
      details.push({
        block: block.number,
        line: block.startLine + 1,
        message: 'Cues must be sorted by start time.',
      });
    }
  }

  if (details.length > 0) {
    throw new SrtParseError(details);
  }

  const warnings: SrtParseWarning[] = [];

  for (let index = 1; index < cues.length; index += 1) {
    if (cues[index]!.startMs < cues[index - 1]!.endMs) {
      warnings.push({
        code: 'SRT_OVERLAP',
        cueIndex: cues[index]!.index,
        message: `Cue ${cues[index]!.index} overlaps the previous cue.`,
      });
    }
  }

  return { cues, warnings };
}
