import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseRenderedVideoProbe,
  probeRenderedVideo,
  renderThumbnail,
  type RenderStill,
} from '../apps/worker/src/render-finalization.js';
import { RenderPipelineError } from '../apps/worker/src/render-errors.js';
import type {
  RenderInputProps,
  SelectedComposition,
} from '../apps/worker/src/render-composition.js';

const temporaryDirectories: string[] = [];
const composition = {
  id: 'ProjectVideo',
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 300,
} as SelectedComposition;
const ffprobeOutput = JSON.stringify({
  streams: [
    {
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      width: 1080,
      height: 1920,
      duration: '10.000',
    },
    { index: 1, codec_type: 'audio', codec_name: 'aac' },
  ],
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '10.000', size: '2048' },
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function temporaryFile(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'hansys-finalization-'));
  temporaryDirectories.push(directory);
  return join(directory, name);
}

describe('render output finalization', () => {
  it('probes a non-empty H.264 file and records verified metadata', async () => {
    const videoPath = temporaryFile('video.mp4');
    writeFileSync(videoPath, Buffer.alloc(2048));
    const probe = vi.fn(async () => ffprobeOutput);

    await expect(probeRenderedVideo(videoPath, composition, probe)).resolves.toEqual({
      sizeBytes: 2048n,
      width: 1080,
      height: 1920,
      durationMs: 10_000n,
      metadata: {
        videoCodec: 'h264',
        hasAudio: true,
        streamCount: 2,
        formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      },
    });
    expect(probe).toHaveBeenCalledWith(videoPath);
  });

  it('rejects a wrong codec or dimensions with OUTPUT_PROBE_FAILED', () => {
    const wrongCodec = ffprobeOutput.replace('h264', 'hevc');
    const wrongDimensions = ffprobeOutput.replace('1080', '720');

    expect(() => parseRenderedVideoProbe(wrongCodec, composition, 2048n)).toThrowError(
      RenderPipelineError,
    );
    expect(() => parseRenderedVideoProbe(wrongDimensions, composition, 2048n)).toThrowError(
      expect.objectContaining({ code: 'OUTPUT_PROBE_FAILED' }),
    );
  });

  it('renders a midpoint JPEG and verifies the physical file', async () => {
    const thumbnailPath = temporaryFile('thumbnail.jpg');
    const render = vi.fn(async (options: Parameters<RenderStill>[0]) => {
      writeFileSync(options.output as string, Buffer.from('jpeg'));
      return { buffer: null, contentType: 'image/jpeg' };
    }) as RenderStill;
    const cancelSignal = vi.fn();

    await expect(
      renderThumbnail({
        outputLocation: thumbnailPath,
        serveUrl: 'bundle',
        composition,
        inputProps: { project: {}, assets: {} } as unknown as RenderInputProps,
        cancelSignal,
        render,
      }),
    ).resolves.toEqual({
      sizeBytes: 4n,
      width: 1080,
      height: 1920,
      frame: 149,
    });
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        output: thumbnailPath,
        frame: 149,
        imageFormat: 'jpeg',
        jpegQuality: 85,
        cancelSignal,
      }),
    );
  });
});
