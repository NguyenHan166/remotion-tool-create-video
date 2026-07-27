import { describe, expect, it } from 'vitest';
import { computeProjectContentHash } from '../packages/database/src/index.js';

describe('project content hash', () => {
  it('uses canonical key ordering for deterministic SHA-256 hashes', () => {
    const expectedHash = '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777';

    expect(
      computeProjectContentHash({
        b: 2,
        a: 1,
      }),
    ).toBe(expectedHash);
    expect(
      computeProjectContentHash({
        a: 1,
        b: 2,
      }),
    ).toBe(expectedHash);
  });

  it('changes when nested project content changes', () => {
    const originalHash = computeProjectContentHash({
      scenes: [
        {
          text: {
            headline: 'Original',
          },
        },
      ],
    });
    const changedHash = computeProjectContentHash({
      scenes: [
        {
          text: {
            headline: 'Changed',
          },
        },
      ],
    });

    expect(changedHash).not.toBe(originalHash);
    expect(changedHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
