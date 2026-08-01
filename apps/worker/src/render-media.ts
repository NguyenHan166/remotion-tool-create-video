import type {
  BrowserLog,
  CancelSignal,
  RenderMediaProgress,
  X264Preset,
  renderMedia,
} from '@remotion/renderer';
import type { RenderInputProps, SelectedComposition } from './render-composition.js';

export const RENDER_PROGRESS_INTERVAL_MS = 500;
export const RENDER_PROGRESS_START = 0.1;
export const RENDER_PROGRESS_END = 0.97;

export type RenderPreset = 'draft' | 'vertical-h264' | 'vertical-high';

export type RenderExecutionProgress = Readonly<{
  status: 'RENDERING' | 'ENCODING';
  progress: number;
  renderedFrames: number;
  encodedFrames: number;
  totalFrames: number;
  stageMessage: string;
}>;

export type RenderH264MediaOptions = {
  preset: string;
  outputLocation: string;
  serveUrl: string;
  composition: SelectedComposition;
  inputProps: RenderInputProps;
  frameConcurrency: string | number;
  muted: boolean;
  cancelSignal?: CancelSignal;
  render: typeof renderMedia;
  writeProgress: (progress: RenderExecutionProgress) => Promise<void>;
  onBrowserLog?: (log: BrowserLog) => void;
  progressIntervalMs?: number;
};

const presetOptions = {
  draft: { crf: 28, x264Preset: 'veryfast' },
  'vertical-h264': { crf: 23, x264Preset: 'medium' },
  'vertical-high': { crf: 18, x264Preset: 'slow' },
} as const satisfies Record<RenderPreset, { crf: number; x264Preset: X264Preset }>;

function getPresetOptions(preset: string): (typeof presetOptions)[RenderPreset] {
  if (!(preset in presetOptions)) {
    throw new RangeError(`Unsupported render preset: ${preset}`);
  }

  return presetOptions[preset as RenderPreset];
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

class RenderProgressReporter {
  readonly #totalFrames: number;
  readonly #intervalMs: number;
  readonly #writeProgress: RenderH264MediaOptions['writeProgress'];
  #latest: RenderExecutionProgress;
  #lastQueuedAt = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #writes = Promise.resolve();
  #failure: unknown;
  #finished = false;

  constructor({
    totalFrames,
    intervalMs,
    writeProgress,
  }: {
    totalFrames: number;
    intervalMs: number;
    writeProgress: RenderH264MediaOptions['writeProgress'];
  }) {
    this.#totalFrames = totalFrames;
    this.#intervalMs = intervalMs;
    this.#writeProgress = writeProgress;
    this.#latest = {
      status: 'RENDERING',
      progress: RENDER_PROGRESS_START,
      renderedFrames: 0,
      encodedFrames: 0,
      totalFrames,
      stageMessage: `Rendering frames (0/${totalFrames}).`,
    };
  }

  async start(): Promise<void> {
    this.#queueLatest();
    await this.#writes;
    this.#throwFailure();
  }

  report(progress: RenderMediaProgress): void {
    if (this.#finished) {
      return;
    }

    const previousStatus = this.#latest.status;
    const renderedFrames = Math.max(
      this.#latest.renderedFrames,
      Math.floor(clamp(progress.renderedFrames, 0, this.#totalFrames)),
    );
    const encodedFrames = Math.max(
      this.#latest.encodedFrames,
      Math.floor(clamp(progress.encodedFrames, 0, this.#totalFrames)),
    );
    const status =
      this.#latest.status === 'ENCODING' ||
      progress.stitchStage === 'muxing' ||
      renderedFrames >= this.#totalFrames
        ? 'ENCODING'
        : 'RENDERING';
    const weightedProgress =
      RENDER_PROGRESS_START +
      clamp(progress.progress, 0, 1) * (RENDER_PROGRESS_END - RENDER_PROGRESS_START);

    this.#latest = {
      status,
      progress: Math.max(this.#latest.progress, weightedProgress),
      renderedFrames,
      encodedFrames,
      totalFrames: this.#totalFrames,
      stageMessage:
        status === 'RENDERING'
          ? `Rendering frames (${renderedFrames}/${this.#totalFrames}).`
          : progress.stitchStage === 'muxing'
            ? 'Muxing H.264 media.'
            : `Encoding H.264 media (${encodedFrames}/${this.#totalFrames} frames).`,
    };

    const elapsed = Date.now() - this.#lastQueuedAt;

    if (status !== previousStatus || elapsed >= this.#intervalMs) {
      this.#queueLatest();
      return;
    }

    if (this.#timer === undefined) {
      this.#timer = setTimeout(
        () => {
          this.#timer = undefined;
          this.#queueLatest();
        },
        Math.max(0, this.#intervalMs - elapsed),
      );
      this.#timer.unref?.();
    }
  }

  async finish(): Promise<void> {
    this.#finished = true;

    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }

    this.#latest = {
      status: 'ENCODING',
      progress: RENDER_PROGRESS_END,
      renderedFrames: this.#totalFrames,
      encodedFrames: this.#totalFrames,
      totalFrames: this.#totalFrames,
      stageMessage: 'H.264 media rendered.',
    };
    this.#queueLatest();
    await this.#writes;
    this.#throwFailure();
  }

  async abort(): Promise<void> {
    this.#finished = true;

    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }

    await this.#writes;
  }

  #queueLatest(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }

    const snapshot = this.#latest;
    this.#lastQueuedAt = Date.now();
    this.#writes = this.#writes.then(async () => {
      if (this.#failure !== undefined) {
        return;
      }

      try {
        await this.#writeProgress(snapshot);
      } catch (error) {
        this.#failure = error;
      }
    });
  }

  #throwFailure(): void {
    if (this.#failure !== undefined) {
      throw this.#failure;
    }
  }
}

export async function renderH264Media({
  preset,
  outputLocation,
  serveUrl,
  composition,
  inputProps,
  frameConcurrency,
  muted,
  cancelSignal,
  render,
  writeProgress,
  onBrowserLog,
  progressIntervalMs = RENDER_PROGRESS_INTERVAL_MS,
}: RenderH264MediaOptions): ReturnType<typeof renderMedia> {
  if (!Number.isSafeInteger(composition.durationInFrames) || composition.durationInFrames <= 0) {
    throw new RangeError('Composition duration must be a positive safe integer.');
  }

  if (!Number.isSafeInteger(progressIntervalMs) || progressIntervalMs <= 0) {
    throw new RangeError('Progress interval must be a positive safe integer.');
  }

  const quality = getPresetOptions(preset);
  const progressReporter = new RenderProgressReporter({
    totalFrames: composition.durationInFrames,
    intervalMs: progressIntervalMs,
    writeProgress,
  });

  await progressReporter.start();
  let result: Awaited<ReturnType<typeof renderMedia>>;

  try {
    result = await render({
      codec: 'h264',
      outputLocation,
      serveUrl,
      composition,
      inputProps,
      concurrency: frameConcurrency,
      muted,
      ...(cancelSignal === undefined ? {} : { cancelSignal }),
      crf: quality.crf,
      x264Preset: quality.x264Preset,
      overwrite: false,
      onProgress: (progress) => progressReporter.report(progress),
      ...(onBrowserLog === undefined ? {} : { onBrowserLog }),
    });
  } catch (error) {
    await progressReporter.abort();
    throw error;
  }

  await progressReporter.finish();

  return result;
}
