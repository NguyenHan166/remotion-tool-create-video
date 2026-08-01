import { describe, expect, it } from 'vitest';
import { type CaptionEntryV1 } from '../packages/project-schema/src/index.js';
import {
  getActiveCaptionEntry,
  getActiveCaptionPage,
  getCaptionPages,
  getHighlightedCaptionWordIndex,
} from '../packages/video/src/templates/news-clean-v1/CaptionLayer.js';

const entries: CaptionEntryV1[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    startMs: 0,
    endMs: 1_000,
    text: 'Xin chào',
    tokens: [
      { text: 'Xin', startMs: 0, endMs: 400 },
      { text: 'chào', startMs: 400, endMs: 1_000 },
    ],
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    startMs: 1_050,
    endMs: 2_000,
    text: 'Việt Nam hôm nay',
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    startMs: 3_000,
    endMs: 3_600,
    text: 'Tin mới',
  },
];

describe('caption rendering timing', () => {
  it('uses the later caption when accepted entries overlap and hides captions at end time', () => {
    const overlapping = [entries[0]!, { ...entries[1]!, startMs: 500, endMs: 1_500 }];

    expect(getActiveCaptionEntry(overlapping, 650)?.id).toBe(entries[1]!.id);
    expect(getActiveCaptionEntry(entries, 1_000)).toBeUndefined();
  });

  it('groups TikTok words by page capacity and breaks pages across spoken gaps', () => {
    const pages = getCaptionPages(entries, 3);

    expect(pages.map((page) => page.words.map((word) => word.text).join(' '))).toEqual([
      'Xin chào Việt',
      'Nam hôm nay',
      'Tin mới',
    ]);
    expect(pages.map((page) => [page.startMs, page.endMs])).toEqual([
      [0, 1_287],
      [1_287, 2_000],
      [3_000, 3_600],
    ]);
    expect(getActiveCaptionPage(pages, 1_287)?.words[0]?.text).toBe('Nam');
  });

  it('highlights only words with supplied timing data', () => {
    const pages = getCaptionPages(entries, 6);

    expect(getHighlightedCaptionWordIndex(pages[0]!.words, 500)).toBe(1);
    expect(getHighlightedCaptionWordIndex(pages[0]!.words, 1_200)).toBeUndefined();
  });
});
