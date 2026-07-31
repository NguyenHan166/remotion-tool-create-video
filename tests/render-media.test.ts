import { describe, expect, it, vi } from 'vitest';
import {
  RENDER_PROGRESS_END,
  RENDER_PROGRESS_START,
  renderH264Media,
  type RenderH264MediaOptions,
} from '../apps/worker/src/render-media.js';
import type {
  RenderInputProps,
  SelectedComposition,
} from '../apps/worker/src/render-composition.js';

type RenderOptions = Parameters<RenderH264MediaOptions['render']>[0];

const inputProps = Object.freeze({
  project: {
    export: { muted: false },
  },
  assets: Object.freeze({}),
}) as unknown as RenderInputProps;
const composition = {
  id: 'ProjectVideo',
  width: 320,
  height: 320,
  fps: 24,
  durationInFrames: 12,
} as SelectedComposition;

function progress(
  overrides: Partial<
    NonNullable<RenderOptions['onProgress']> extends (value: infer T) => void ? T : never
  > = {},
) {
  return {
    renderedFrames: 1,
    encodedFrames: 0,
    encodedDoneIn: null,
    renderedDoneIn: null,
    renderEstimatedTime: 100,
    progress: 0.1,
    stitchStage: 'encoding' as const,
    ...overrides,
  };
}

describe('H.264 media rendering', () => {
  it('renders with immutable props and throttles progress except on stage changes', async () => {
    const writes: Array<Parameters<RenderH264MediaOptions['writeProgress']>[0]> = [];
    let receivedOptions: RenderOptions | undefined;
    const render = vi.fn(async (options: RenderOptions) => {
      receivedOptions = options;
      options.onProgress?.(progress({ renderedFrames: 1, progress: 0.1 }));
      options.onProgress?.(progress({ renderedFrames: 2, progress: 0.2 }));
      options.onProgress?.(
        progress({
          renderedFrames: 12,
          encodedFrames: 8,
          progress: 0.8,
          stitchStage: 'muxing',
        }),
      );

      return { buffer: null, slowestFrames: [], contentType: 'video/mp4' };
    }) as RenderH264MediaOptions['render'];

    await expect(
      renderH264Media({
        preset: 'vertical-h264',
        outputLocation: 'temp/job/video.mp4',
        serveUrl: 'temp/bundle',
        composition,
        inputProps,
        frameConcurrency: '50%',
        muted: false,
        render,
        writeProgress: async (value) => {
          writes.push(value);
        },
      }),
    ).resolves.toMatchObject({ contentType: 'video/mp4' });

    expect(receivedOptions).toMatchObject({
      codec: 'h264',
      outputLocation: 'temp/job/video.mp4',
      serveUrl: 'temp/bundle',
      composition,
      concurrency: '50%',
      muted: false,
      crf: 23,
      x264Preset: 'medium',
      overwrite: false,
    });
    expect(receivedOptions?.inputProps).toBe(inputProps);
    expect(writes).toHaveLength(3);
    expect(writes[0]).toMatchObject({
      status: 'RENDERING',
      progress: RENDER_PROGRESS_START,
      renderedFrames: 0,
      encodedFrames: 0,
      totalFrames: 12,
    });
    expect(writes[1]).toMatchObject({
      status: 'ENCODING',
      renderedFrames: 12,
      encodedFrames: 8,
      stageMessage: 'Muxing H.264 media.',
    });
    expect(writes[2]).toEqual({
      status: 'ENCODING',
      progress: RENDER_PROGRESS_END,
      renderedFrames: 12,
      encodedFrames: 12,
      totalFrames: 12,
      stageMessage: 'H.264 media rendered.',
    });
    expect(
      writes.every((value, index) => index === 0 || value.progress >= writes[index - 1]!.progress),
    ).toBe(true);
  });

  it.each([
    ['draft', 28, 'veryfast'],
    ['vertical-high', 18, 'slow'],
  ])('maps the %s quality preset', async (preset, crf, x264Preset) => {
    const render = vi.fn(async () => ({
      buffer: null,
      slowestFrames: [],
      contentType: 'video/mp4',
    })) as RenderH264MediaOptions['render'];

    await renderH264Media({
      preset,
      outputLocation: 'video.mp4',
      serveUrl: 'bundle',
      composition,
      inputProps,
      frameConcurrency: 2,
      muted: true,
      render,
      writeProgress: async () => undefined,
    });

    expect(render).toHaveBeenCalledWith(expect.objectContaining({ crf, x264Preset }));
  });

  it('stops before rendering when the initial progress write fails', async () => {
    const render = vi.fn() as unknown as RenderH264MediaOptions['render'];

    await expect(
      renderH264Media({
        preset: 'vertical-h264',
        outputLocation: 'video.mp4',
        serveUrl: 'bundle',
        composition,
        inputProps,
        frameConcurrency: 1,
        muted: false,
        render,
        writeProgress: async () => {
          throw new Error('job ownership changed');
        },
      }),
    ).rejects.toThrowError('job ownership changed');
    expect(render).not.toHaveBeenCalled();
  });

  it('cancels a pending throttled write when Remotion fails', async () => {
    vi.useFakeTimers();
    const writeProgress = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn(async (options: RenderOptions) => {
      options.onProgress?.(progress({ renderedFrames: 2, progress: 0.2 }));
      throw new Error('renderer failed');
    }) as RenderH264MediaOptions['render'];

    try {
      await expect(
        renderH264Media({
          preset: 'vertical-h264',
          outputLocation: 'video.mp4',
          serveUrl: 'bundle',
          composition,
          inputProps,
          frameConcurrency: 1,
          muted: false,
          render,
          writeProgress,
        }),
      ).rejects.toThrowError('renderer failed');
      await vi.advanceTimersByTimeAsync(500);
      expect(writeProgress).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects unknown presets before invoking Remotion', async () => {
    const render = vi.fn() as unknown as RenderH264MediaOptions['render'];

    await expect(
      renderH264Media({
        preset: 'webm',
        outputLocation: 'video.mp4',
        serveUrl: 'bundle',
        composition,
        inputProps,
        frameConcurrency: 1,
        muted: false,
        render,
        writeProgress: async () => undefined,
      }),
    ).rejects.toThrowError('Unsupported render preset: webm');
    expect(render).not.toHaveBeenCalled();
  });
});
