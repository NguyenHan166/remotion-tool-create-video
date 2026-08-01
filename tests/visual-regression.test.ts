import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const approvedSnapshots = JSON.parse(
  readFileSync(resolve('tests/fixtures/visual-regression/approved.json'), 'utf8'),
) as {
  schemaVersion: number;
  sampleGridSize: number;
  thresholds: {
    pixelTolerance: number;
    maxMeanColorDistance: number;
    maxChangedFraction: number;
    maxAverageHashDistance: number;
  };
  templates: Record<
    string,
    {
      frames: Record<
        string,
        {
          frame: number;
          width: number;
          height: number;
          sampleGridSize: number;
          averageHash: string;
          samples: string;
          encodedSha256: string;
        }
      >;
    }
  >;
};

const expectedFrames = {
  'news-clean-v1': { start: 0, midpoint: 105, end: 209 },
  'breaking-red-v1': { start: 0, midpoint: 60, end: 119 },
  'warning-dark-v1': { start: 0, midpoint: 90, end: 179 },
};

describe('visual regression approvals', () => {
  it('contains approved frames for every registered template fixture', () => {
    expect(approvedSnapshots.schemaVersion).toBe(1);
    expect(approvedSnapshots.sampleGridSize).toBe(32);
    expect(Object.keys(approvedSnapshots.templates).sort()).toEqual(
      Object.keys(expectedFrames).sort(),
    );

    for (const [templateId, frames] of Object.entries(expectedFrames)) {
      const approvedTemplate = approvedSnapshots.templates[templateId];
      expect(approvedTemplate).toBeDefined();

      for (const [frameName, frameNumber] of Object.entries(frames)) {
        const approvedFrame = approvedTemplate?.frames[frameName];
        expect(approvedFrame).toMatchObject({
          frame: frameNumber,
          width: 1080,
          height: 1920,
          sampleGridSize: 32,
        });
        expect(approvedFrame?.averageHash).toMatch(/^[0-9a-f]{16}$/);
        expect(approvedFrame?.samples).toMatch(/^[A-Za-z0-9+/]+=*$/);
        expect(approvedFrame?.encodedSha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it('keeps comparison thresholds explicit and tolerant of tiny raster differences', () => {
    expect(approvedSnapshots.thresholds.pixelTolerance).toBeGreaterThan(0);
    expect(approvedSnapshots.thresholds.pixelTolerance).toBeLessThan(0.1);
    expect(approvedSnapshots.thresholds.maxMeanColorDistance).toBeGreaterThan(0);
    expect(approvedSnapshots.thresholds.maxMeanColorDistance).toBeLessThan(0.1);
    expect(approvedSnapshots.thresholds.maxChangedFraction).toBeGreaterThan(0);
    expect(approvedSnapshots.thresholds.maxChangedFraction).toBeLessThan(0.5);
    expect(approvedSnapshots.thresholds.maxAverageHashDistance).toBeGreaterThan(0);
    expect(approvedSnapshots.thresholds.maxAverageHashDistance).toBeLessThan(64);
  });
});
