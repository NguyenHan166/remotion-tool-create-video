import { describe, expect, it } from 'vitest';
import { STUDIO_PROJECT_FIXTURE, STUDIO_VIDEO_PROPS } from '../packages/video/src/fixture.js';
import {
  calculateProjectMetadata,
  getTotalDurationInFrames,
  parseProjectDocument,
} from '../packages/video/src/metadata.js';
import { PROJECT_VIDEO_COMPOSITION_ID, Root } from '../packages/video/src/root.js';

describe('shared Remotion composition', () => {
  it('calculates dynamic metadata from a normalized ProjectDocument', async () => {
    const project = structuredClone(STUDIO_PROJECT_FIXTURE);
    project.composition = {
      ...project.composition,
      width: 720,
      height: 1280,
      fps: 25,
    };
    project.scenes = [
      {
        ...project.scenes[0]!,
        durationInFrames: 75,
      },
      {
        ...project.scenes[1]!,
        enabled: false,
        durationInFrames: 500,
      },
    ];
    const assets = {
      'asset-1': {
        id: 'asset-1',
        kind: 'IMAGE' as const,
        src: 'http://127.0.0.1/media/asset-1',
        width: 1200,
        height: 800,
      },
    };

    const metadata = await calculateProjectMetadata({
      defaultProps: STUDIO_VIDEO_PROPS,
      props: {
        project,
        assets,
      },
      abortSignal: new AbortController().signal,
      compositionId: PROJECT_VIDEO_COMPOSITION_ID,
      isRendering: false,
    });

    expect(metadata).toMatchObject({
      durationInFrames: 75,
      width: 720,
      height: 1280,
      fps: 25,
      defaultCodec: 'h264',
      props: {
        assets,
        project: {
          composition: {
            width: 720,
            height: 1280,
            fps: 25,
          },
        },
      },
    });
  });

  it('normalizes omitted defaults and rejects invalid project input', () => {
    const normalized = parseProjectDocument({
      schemaVersion: 1,
      metadata: {
        title: 'Metadata defaults',
      },
      template: {
        id: 'news-clean-v1',
      },
      scenes: [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          type: 'headline',
          name: 'Opening',
        },
      ],
    });

    expect(normalized.composition).toEqual({
      width: 1080,
      height: 1920,
      fps: 30,
      backgroundColor: '#090B10',
    });
    expect(getTotalDurationInFrames(normalized)).toBe(150);
    expect(() =>
      parseProjectDocument({
        ...normalized,
        scenes: normalized.scenes.map((scene) => ({
          ...scene,
          enabled: false,
        })),
      }),
    ).toThrow(/At least one scene must be enabled/);
  });

  it('registers the fixture-backed ProjectVideo composition in Root', () => {
    const element = Root();

    expect(element.type).toBeTypeOf('function');
    expect(element.props).toMatchObject({
      id: PROJECT_VIDEO_COMPOSITION_ID,
      defaultProps: STUDIO_VIDEO_PROPS,
      durationInFrames: 210,
      width: 1080,
      height: 1920,
      fps: 30,
      calculateMetadata: calculateProjectMetadata,
    });
  });
});
