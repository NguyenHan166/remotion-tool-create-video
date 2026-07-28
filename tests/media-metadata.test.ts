import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  FfprobeMediaMetadataExtractor,
  MediaMetadataExtractionError,
  parseFfprobeMediaMetadata,
} from '../apps/web/src/assets/media-metadata.js';

function readFixture(name: 'audio' | 'image' | 'video'): string {
  return readFileSync(new URL(`./fixtures/ffprobe/${name}.json`, import.meta.url), 'utf8');
}

describe('ffprobe media metadata', () => {
  it('extracts image dimensions from the image fixture', () => {
    expect(parseFfprobeMediaMetadata('IMAGE', readFixture('image'))).toEqual({
      width: 640,
      height: 360,
      durationMs: null,
      hasAudio: false,
      metadata: {
        streamCount: 1,
        formatName: 'png_pipe',
        videoCodec: 'png',
      },
    });
  });

  it('extracts video dimensions, duration and audio presence from the video fixture', () => {
    expect(parseFfprobeMediaMetadata('VIDEO', readFixture('video'))).toEqual({
      width: 1920,
      height: 1080,
      durationMs: 2500n,
      hasAudio: true,
      metadata: {
        streamCount: 2,
        formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
        videoCodec: 'h264',
        audioCodec: 'aac',
      },
    });
  });

  it('extracts duration and audio presence from the audio fixture', () => {
    expect(parseFfprobeMediaMetadata('AUDIO', readFixture('audio'))).toEqual({
      width: null,
      height: null,
      durationMs: 1235n,
      hasAudio: true,
      metadata: {
        streamCount: 1,
        formatName: 'mp3',
        audioCodec: 'mp3',
      },
    });
  });

  it('rejects invalid or incomplete ffprobe output', () => {
    expect(() => parseFfprobeMediaMetadata('VIDEO', '{"streams":[]}')).toThrowError(
      MediaMetadataExtractionError,
    );
    expect(() => parseFfprobeMediaMetadata('AUDIO', 'not-json')).toThrowError(
      MediaMetadataExtractionError,
    );
  });

  it('passes the stored path to ffprobe and skips probing subtitles', async () => {
    const runFfprobe = vi.fn(async () => readFixture('video'));
    const extractor = new FfprobeMediaMetadataExtractor(runFfprobe);

    await expect(
      extractor.extract({
        kind: 'VIDEO',
        filePath: 'D:\\data\\assets\\asset.mp4',
      }),
    ).resolves.toMatchObject({
      width: 1920,
      height: 1080,
    });
    await expect(
      extractor.extract({
        kind: 'SUBTITLE',
        filePath: 'D:\\data\\assets\\captions.srt',
      }),
    ).resolves.toEqual({
      width: null,
      height: null,
      durationMs: null,
      hasAudio: false,
      metadata: {
        formatName: 'subrip',
        streamCount: 1,
      },
    });
    expect(runFfprobe).toHaveBeenCalledTimes(1);
    expect(runFfprobe).toHaveBeenCalledWith('D:\\data\\assets\\asset.mp4');
  });
});
