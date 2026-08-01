import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SrtParseError, parseSrt } from '../packages/project-schema/src/index.js';

describe('SRT parser', () => {
  it('imports the Vietnamese UTF-8 fixture with multiline text and exact timing', () => {
    const source = readFileSync(resolve('tests/fixtures/captions/vi.srt'), 'utf8');

    expect(parseSrt(source)).toEqual({
      cues: [
        {
          index: 1,
          startMs: 500,
          endMs: 2_800,
          text: 'Xin chào! Đây là bản tin hôm nay.',
        },
        {
          index: 2,
          startMs: 3_100,
          endMs: 6_250,
          text: 'Các điểm đáng chú ý\nsẽ được cập nhật liên tục.',
        },
        {
          index: 3,
          startMs: 6_500,
          endMs: 9_000,
          text: 'Cảm ơn bạn đã theo dõi.',
        },
      ],
      warnings: [],
    });
  });

  it('accepts a BOM, CRLF, dot milliseconds and timing settings', () => {
    const source = '\uFEFF1\r\n00:00:01.000 --> 00:00:02.500 position:50%\r\nPhụ đề UTF-8\r\n';

    expect(parseSrt(source).cues).toEqual([
      {
        index: 1,
        startMs: 1_000,
        endMs: 2_500,
        text: 'Phụ đề UTF-8',
      },
    ]);
  });

  it('accepts overlap with a field-safe warning', () => {
    const result = parseSrt(`1
00:00:00,000 --> 00:00:02,000
Câu đầu

2
00:00:01,500 --> 00:00:03,000
Câu sau`);

    expect(result.warnings).toEqual([
      {
        code: 'SRT_OVERLAP',
        cueIndex: 2,
        message: 'Cue 2 overlaps the previous cue.',
      },
    ]);
  });

  it('reports malformed indices, timing, text and ordering with block and line numbers', () => {
    const source = `one
00:00:02,000 --> 00:00:01,000


2
invalid timing
Nội dung

3
00:00:00,000 --> 00:00:01,000
Câu bị sai thứ tự`;
    const error = (() => {
      try {
        parseSrt(source);
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(SrtParseError);
    expect(error).toMatchObject({
      code: 'SRT_INVALID',
      details: expect.arrayContaining([
        expect.objectContaining({ block: 1, line: 1, message: expect.stringContaining('index') }),
        expect.objectContaining({ block: 1, line: 2, message: expect.stringContaining('greater') }),
        expect.objectContaining({ block: 1, line: 3, message: expect.stringContaining('blank') }),
        expect.objectContaining({ block: 2, line: 6, message: expect.stringContaining('Timing') }),
      ]),
    });
  });

  it('rejects duplicate cue indices and NUL bytes', () => {
    expect(() =>
      parseSrt(`1
00:00:00,000 --> 00:00:01,000
A

1
00:00:01,000 --> 00:00:02,000
B`),
    ).toThrowError(expect.objectContaining({ code: 'SRT_INVALID' }));
    expect(() => parseSrt('1\n00:00:00,000 --> 00:00:01,000\nA\0B')).toThrowError(
      expect.objectContaining({ code: 'SRT_INVALID' }),
    );
  });
});
