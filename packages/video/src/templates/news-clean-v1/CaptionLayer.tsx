import {
  type CaptionConfigV1,
  type CaptionEntryV1,
  type ProjectDocumentV1,
} from '@hansys/project-schema';
import { type CSSProperties } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { NEWS_CLEAN_COLORS, NEWS_CLEAN_FONT_FAMILY, NEWS_CLEAN_SAFE_AREA } from './tokens.js';

const PAGE_GAP_MS = 500;

export type CaptionWord = Readonly<{
  text: string;
  startMs: number;
  endMs: number;
  hasTiming: boolean;
}>;

export type CaptionPage = Readonly<{
  startMs: number;
  endMs: number;
  words: readonly CaptionWord[];
}>;

function wordsFromEntry(entry: CaptionEntryV1): CaptionWord[] {
  if (entry.tokens !== undefined && entry.tokens.length > 0) {
    return entry.tokens.map((token) => ({
      text: token.text,
      startMs: token.startMs,
      endMs: token.endMs,
      hasTiming: true,
    }));
  }

  const words = entry.text.trim().split(/\s+/u);
  const durationMs = entry.endMs - entry.startMs;

  return words.map((text, index) => ({
    text,
    startMs: entry.startMs + Math.floor((durationMs * index) / words.length),
    endMs: entry.startMs + Math.floor((durationMs * (index + 1)) / words.length),
    hasTiming: false,
  }));
}

export function getCaptionPages(
  entries: readonly CaptionEntryV1[],
  maxWordsPerPage: number,
): CaptionPage[] {
  const pages: CaptionPage[] = [];

  for (const entry of entries) {
    for (const word of wordsFromEntry(entry)) {
      const currentPage = pages.at(-1);
      const startsNewPage =
        currentPage === undefined ||
        currentPage.words.length >= maxWordsPerPage ||
        word.startMs - currentPage.endMs > PAGE_GAP_MS;

      if (startsNewPage) {
        pages.push({ startMs: word.startMs, endMs: word.endMs, words: [word] });
        continue;
      }

      pages[pages.length - 1] = {
        ...currentPage,
        endMs: word.endMs,
        words: [...currentPage.words, word],
      };
    }
  }

  return pages;
}

export function getActiveCaptionEntry(
  entries: readonly CaptionEntryV1[],
  currentMs: number,
): CaptionEntryV1 | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;

    if (entry.startMs <= currentMs && currentMs < entry.endMs) {
      return entry;
    }
  }

  return undefined;
}

export function getActiveCaptionPage(
  pages: readonly CaptionPage[],
  currentMs: number,
): CaptionPage | undefined {
  return pages.find((page) => page.startMs <= currentMs && currentMs < page.endMs);
}

export function getHighlightedCaptionWordIndex(
  words: readonly CaptionWord[],
  currentMs: number,
): number | undefined {
  const index = words.findIndex(
    (word) => word.hasTiming && word.startMs <= currentMs && currentMs < word.endMs,
  );

  return index === -1 ? undefined : index;
}

function getPositionStyle(position: CaptionConfigV1['options']['position']): CSSProperties {
  const shared = {
    left: NEWS_CLEAN_SAFE_AREA.horizontal,
    right: NEWS_CLEAN_SAFE_AREA.horizontal,
  };

  switch (position) {
    case 'top':
      return { ...shared, top: '9%' };
    case 'center':
      return { ...shared, top: '50%', transform: 'translateY(-50%)' };
    case 'bottom':
      return { ...shared, bottom: '13.5%' };
  }
}

function CaptionWords({
  words,
  currentMs,
  highlightCurrentWord,
  style,
}: {
  words: readonly CaptionWord[];
  currentMs: number;
  highlightCurrentWord: boolean;
  style: (isHighlighted: boolean) => CSSProperties;
}) {
  const highlightedIndex = highlightCurrentWord
    ? getHighlightedCaptionWordIndex(words, currentMs)
    : undefined;

  return (
    <>
      {words.map((word, index) => (
        <span key={`${word.startMs}-${index}`} style={style(index === highlightedIndex)}>
          {index === 0 ? word.text : ` ${word.text}`}
        </span>
      ))}
    </>
  );
}

function CleanCaption({
  entry,
  captions,
  currentMs,
  fontSize,
}: {
  entry: CaptionEntryV1;
  captions: CaptionConfigV1;
  currentMs: number;
  fontSize: number;
}) {
  const words = wordsFromEntry(entry);

  return (
    <div
      style={{
        alignSelf: 'center',
        backgroundColor: 'rgba(14, 34, 56, 0.90)',
        borderRadius: 18,
        boxDecorationBreak: 'clone',
        color: NEWS_CLEAN_COLORS.white,
        fontSize,
        fontWeight: 700,
        lineHeight: 1.32,
        maxWidth: '100%',
        padding: '0.25em 0.5em',
        textAlign: 'center',
      }}
    >
      <CaptionWords
        currentMs={currentMs}
        highlightCurrentWord={captions.options.highlightCurrentWord}
        style={(isHighlighted) => ({
          color: isHighlighted ? NEWS_CLEAN_COLORS.accent : undefined,
        })}
        words={words}
      />
    </div>
  );
}

function TikTokCaption({
  page,
  captions,
  currentMs,
  fontSize,
}: {
  page: CaptionPage;
  captions: CaptionConfigV1;
  currentMs: number;
  fontSize: number;
}) {
  return (
    <div
      style={{
        alignSelf: 'center',
        color: NEWS_CLEAN_COLORS.white,
        fontSize: Math.round(fontSize * 1.12),
        fontWeight: 800,
        letterSpacing: '-0.035em',
        lineHeight: 1.1,
        maxWidth: '100%',
        textAlign: 'center',
        textShadow: '0 4px 12px rgba(0, 0, 0, 0.9), 2px 0 0 #0E2238, -2px 0 0 #0E2238',
        textTransform: 'uppercase',
      }}
    >
      <CaptionWords
        currentMs={currentMs}
        highlightCurrentWord={captions.options.highlightCurrentWord}
        style={(isHighlighted) => ({
          backgroundColor: isHighlighted ? NEWS_CLEAN_COLORS.accent : undefined,
          borderRadius: isHighlighted ? 8 : undefined,
          color: isHighlighted ? NEWS_CLEAN_COLORS.white : undefined,
          padding: isHighlighted ? '0.02em 0.12em' : undefined,
        })}
        words={page.words}
      />
    </div>
  );
}

function NewsCaption({
  entry,
  captions,
  currentMs,
  fontSize,
}: {
  entry: CaptionEntryV1;
  captions: CaptionConfigV1;
  currentMs: number;
  fontSize: number;
}) {
  const words = wordsFromEntry(entry);

  return (
    <div
      style={{
        alignSelf: 'stretch',
        backgroundColor: NEWS_CLEAN_COLORS.paper,
        borderLeft: `10px solid ${NEWS_CLEAN_COLORS.accent}`,
        boxShadow: '0 18px 42px rgba(14, 34, 56, 0.22)',
        color: NEWS_CLEAN_COLORS.ink,
        fontSize: Math.round(fontSize * 0.82),
        fontWeight: 800,
        lineHeight: 1.24,
        padding: '0.38em 0.54em',
        textAlign: 'left',
      }}
    >
      <CaptionWords
        currentMs={currentMs}
        highlightCurrentWord={captions.options.highlightCurrentWord}
        style={(isHighlighted) => ({
          color: isHighlighted ? NEWS_CLEAN_COLORS.accent : undefined,
        })}
        words={words}
      />
    </div>
  );
}

export function CaptionLayer({ project }: { project: ProjectDocumentV1 }) {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const { captions } = project;

  if (!captions.enabled || captions.entries.length === 0) {
    return null;
  }

  const currentMs = (frame / fps) * 1_000;
  const activeEntry = getActiveCaptionEntry(captions.entries, currentMs);
  const pages = getCaptionPages(captions.entries, captions.options.maxWordsPerPage);
  const activePage = getActiveCaptionPage(pages, currentMs);
  const fontSize = Math.round(captions.options.fontSize * (Math.min(width, height) / 1_080));
  const visible = captions.style === 'tiktok' ? activePage : activeEntry;

  if (visible === undefined) {
    return null;
  }

  const fadeDurationMs = Math.min(100, (visible.endMs - visible.startMs) / 4);
  const opacity = interpolate(
    currentMs,
    [
      visible.startMs,
      visible.startMs + fadeDurationMs,
      visible.endMs - fadeDurationMs,
      visible.endMs,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      data-caption-layer="true"
      data-caption-style={captions.style}
      style={{ pointerEvents: 'none', zIndex: 30 }}
    >
      <div
        style={{
          ...getPositionStyle(captions.options.position),
          display: 'flex',
          fontFamily: NEWS_CLEAN_FONT_FAMILY,
          opacity,
          position: 'absolute',
        }}
      >
        {captions.style === 'clean' && activeEntry !== undefined ? (
          <CleanCaption
            captions={captions}
            currentMs={currentMs}
            entry={activeEntry}
            fontSize={fontSize}
          />
        ) : null}
        {captions.style === 'tiktok' && activePage !== undefined ? (
          <TikTokCaption
            captions={captions}
            currentMs={currentMs}
            fontSize={fontSize}
            page={activePage}
          />
        ) : null}
        {captions.style === 'news' && activeEntry !== undefined ? (
          <NewsCaption
            captions={captions}
            currentMs={currentMs}
            entry={activeEntry}
            fontSize={fontSize}
          />
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
