'use client';

import { useQuery } from '@tanstack/react-query';
import type { BackgroundMusicTrackV1 } from '@hansys/project-schema';
import { fetchAssets, type AssetDto } from '../../../src/assets/client';

const AUDIO_ASSET_QUERY = {
  kind: 'AUDIO' as const,
  page: 1,
  pageSize: 100,
  search: '',
  status: 'READY' as const,
};

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) {
    return null;
  }

  const seconds = Math.round(durationMs / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function assetLabel(asset: AssetDto): string {
  const duration = formatDuration(asset.durationMs);
  return duration === null ? asset.originalName : `${asset.originalName} (${duration})`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function normalizeTrack(
  track: BackgroundMusicTrackV1,
  durationInFrames: number,
): BackgroundMusicTrackV1 {
  const startAtFrame = clamp(track.startAtFrame, 0, Math.max(0, durationInFrames - 1));
  const availableFrames = Math.max(1, durationInFrames - startAtFrame);
  const fadeInFrames = clamp(track.fadeInFrames, 0, availableFrames);
  const fadeOutFrames = clamp(track.fadeOutFrames, 0, availableFrames - fadeInFrames);

  return {
    ...track,
    fadeInFrames,
    fadeOutFrames,
    startAtFrame,
    volume: Math.min(1, Math.max(0, track.volume)),
  };
}

function createTrack(assetId: string, durationInFrames: number): BackgroundMusicTrackV1 {
  const initialFade = Math.min(15, Math.floor(durationInFrames / 2));

  return {
    assetId,
    fadeInFrames: initialFade,
    fadeOutFrames: initialFade,
    loop: true,
    startAtFrame: 0,
    volume: 0.25,
  };
}

export function BackgroundMusicEditor({
  durationInFrames,
  fps,
  projectArchived,
  backgroundMusic,
  onChange,
}: {
  durationInFrames: number;
  fps: number;
  projectArchived: boolean;
  backgroundMusic: BackgroundMusicTrackV1 | undefined;
  onChange: (backgroundMusic: BackgroundMusicTrackV1 | undefined) => void;
}) {
  const assetsQuery = useQuery({
    queryKey: ['assets', 'background-music', AUDIO_ASSET_QUERY],
    queryFn: ({ signal }) => fetchAssets(AUDIO_ASSET_QUERY, signal),
  });
  const assets = assetsQuery.data?.items ?? [];
  const disabled = projectArchived;
  const track =
    backgroundMusic === undefined ? undefined : normalizeTrack(backgroundMusic, durationInFrames);
  const availableFrames =
    track === undefined ? durationInFrames : durationInFrames - track.startAtFrame;

  return (
    <section
      data-testid="background-music-editor"
      className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#10151f] shadow-[0_14px_40px_rgba(0,0,0,0.16)]"
    >
      <div className="border-b border-white/8 px-4 py-3.5">
        <p className="text-sm font-semibold text-white">Nhạc nền</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Nhạc nền có thể lặp lại và tự fade ở đầu hoặc cuối phần video còn lại.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <label className="block text-xs font-medium text-slate-300">
          Tệp nhạc nền
          <select
            aria-label="Tệp nhạc nền"
            disabled={disabled || assetsQuery.isLoading}
            value={track?.assetId ?? ''}
            onChange={(event) => {
              const assetId = event.target.value;
              onChange(assetId.length === 0 ? undefined : createTrack(assetId, durationInFrames));
            }}
            className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none focus:border-orange-400/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Không dùng nhạc nền</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {assetLabel(asset)}
              </option>
            ))}
          </select>
        </label>

        {assetsQuery.isError ? (
          <p role="alert" className="text-xs text-rose-300">
            Không thể tải thư viện âm thanh.
          </p>
        ) : null}
        {!assetsQuery.isLoading && assets.length === 0 ? (
          <p className="text-xs leading-5 text-slate-500">
            Chưa có tệp âm thanh sẵn sàng. Tải media lên thư viện để chọn nhạc nền.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-300">
            Âm lượng ({Math.round((track?.volume ?? 0.25) * 100)}%)
            <input
              aria-label="Âm lượng nhạc nền"
              disabled={disabled || track === undefined}
              max={1}
              min={0}
              step={0.05}
              type="range"
              value={track?.volume ?? 0.25}
              onChange={(event) => {
                if (track !== undefined) {
                  onChange({
                    ...track,
                    volume: Math.min(1, Math.max(0, Number(event.target.value))),
                  });
                }
              }}
              className="mt-3 w-full accent-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <label className="block text-xs font-medium text-slate-300">
            Bắt đầu (frame)
            <input
              aria-label="Bắt đầu nhạc nền (frame)"
              disabled={disabled || track === undefined}
              max={Math.max(0, durationInFrames - 1)}
              min={0}
              step={1}
              type="number"
              value={track?.startAtFrame ?? 0}
              onChange={(event) => {
                if (track !== undefined) {
                  onChange(
                    normalizeTrack(
                      { ...track, startAtFrame: Number(event.target.value) },
                      durationInFrames,
                    ),
                  );
                }
              }}
              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 font-mono text-sm text-slate-100 outline-none focus:border-orange-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="mt-1 block font-normal text-slate-500">
              {((track?.startAtFrame ?? 0) / fps).toFixed(2)} giây tại {fps} fps
            </span>
          </label>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-300">
          <input
            aria-label="Lặp lại nhạc nền"
            checked={track?.loop ?? false}
            disabled={disabled || track === undefined}
            type="checkbox"
            onChange={(event) => {
              if (track !== undefined) {
                onChange({ ...track, loop: event.target.checked });
              }
            }}
            className="h-4 w-4 accent-orange-400 disabled:cursor-not-allowed"
          />
          Lặp lại đến hết video
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-slate-300">
            Fade in (frame)
            <input
              aria-label="Fade in nhạc nền (frame)"
              disabled={disabled || track === undefined}
              max={Math.max(0, availableFrames - (track?.fadeOutFrames ?? 0))}
              min={0}
              step={1}
              type="number"
              value={track?.fadeInFrames ?? 0}
              onChange={(event) => {
                if (track !== undefined) {
                  onChange(
                    normalizeTrack(
                      { ...track, fadeInFrames: Number(event.target.value) },
                      durationInFrames,
                    ),
                  );
                }
              }}
              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 font-mono text-sm text-slate-100 outline-none focus:border-orange-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <label className="block text-xs font-medium text-slate-300">
            Fade out (frame)
            <input
              aria-label="Fade out nhạc nền (frame)"
              disabled={disabled || track === undefined}
              max={Math.max(0, availableFrames - (track?.fadeInFrames ?? 0))}
              min={0}
              step={1}
              type="number"
              value={track?.fadeOutFrames ?? 0}
              onChange={(event) => {
                if (track !== undefined) {
                  const fadeOutFrames = clamp(
                    Number(event.target.value),
                    0,
                    Math.max(0, availableFrames - track.fadeInFrames),
                  );
                  onChange({ ...track, fadeOutFrames });
                }
              }}
              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 font-mono text-sm text-slate-100 outline-none focus:border-orange-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </div>

        {track === undefined ? null : (
          <p className="text-[11px] leading-5 text-slate-500">
            {availableFrames} frame còn lại; fade in và fade out cộng lại không thể vượt quá số này.
          </p>
        )}
      </div>
    </section>
  );
}
