import type { SceneV1 } from './index.js';

export type ScriptSplitMode = 'blank-line' | 'delimiter' | 'single';

export type ScriptSplitInput = {
  rawText: string;
  splitMode: ScriptSplitMode;
  delimiter?: string | undefined;
  defaultSceneType: SceneV1['type'];
  defaultDurationInFrames: number;
};

export type ScriptSceneDraft = {
  name: string;
  body: string;
  type: SceneV1['type'];
  durationInFrames: number;
};

export type ScriptSplitPreview = {
  scenes: ScriptSceneDraft[];
  warnings: string[];
};

function normalizeNewlines(rawText: string): string {
  return rawText.replace(/\r\n?/g, '\n');
}

function splitText(input: ScriptSplitInput, normalizedText: string): string[] {
  switch (input.splitMode) {
    case 'blank-line':
      return normalizedText.split(/\n(?:[ \t]*\n)+/);
    case 'delimiter':
      if (input.delimiter === undefined || input.delimiter.trim().length === 0) {
        throw new TypeError('A non-blank delimiter is required for delimiter split mode');
      }

      return normalizedText.split(normalizeNewlines(input.delimiter));
    case 'single':
      return [normalizedText];
  }
}

export function splitScriptIntoSceneDrafts(input: ScriptSplitInput): ScriptSplitPreview {
  const segments = splitText(input, normalizeNewlines(input.rawText));
  const bodies = segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  const ignoredSegmentCount = segments.length - bodies.length;
  const warnings: string[] = [];

  if (ignoredSegmentCount > 0) {
    warnings.push(`Ignored ${ignoredSegmentCount} empty script segment(s).`);
  }

  if (bodies.length > 100) {
    warnings.push(`Script creates ${bodies.length} scenes; a project supports at most 100.`);
  }

  bodies.forEach((body, index) => {
    if (body.length > 5_000) {
      warnings.push(`Scene ${index + 1} body exceeds 5000 characters.`);
    }
  });

  return {
    scenes: bodies.map((body, index) => ({
      name: `Scene ${index + 1}`,
      body,
      type: input.defaultSceneType,
      durationInFrames: input.defaultDurationInFrames,
    })),
    warnings,
  };
}
