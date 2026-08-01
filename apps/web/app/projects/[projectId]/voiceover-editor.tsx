'use client';

import { useQuery } from '@tanstack/react-query';
import type { AudioTrackV1 } from '@hansys/project-schema';
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

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
}

function clampStartFrame(value: number): number {
  return Math.max(0, Number.isFinite(value) ? Math.round(value) : 0);
}

export function VoiceoverEditor({
  fps,
  projectArchived,
  voiceover,
  onChange,
}: {
  fps: number;
  projectArchived: boolean;
  voiceover: AudioTrackV1 | undefined;
  onChange: (voiceover: AudioTrackV1 | undefined) => void;
}) {
  const assetsQuery = useQuery({
    queryKey: ['assets', 'voiceover', AUDIO_ASSET_QUERY],
    queryFn: ({ signal }) => fetchAssets(AUDIO_ASSET_QUERY, signal),
  });
  const assets = assetsQuery.data?.items ?? [];
  const disabled = projectArchived;
  const startOffsetSeconds = (voiceover?.startAtFrame ?? 0) / fps;

  return (
    <section
      data-testid="voiceover-editor"
      className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#10151f] shadow-[0_14px_40px_rgba(0,0,0,0.16)]"
    >
      <div className="border-b border-white/8 px-4 py-3.5">
        <p className="text-sm font-semibold text-white">Lời đọc</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Chọn một tệp âm thanh sẵn sàng để phát trong xem trước và bản render.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <label className="block text-xs font-medium text-slate-300">
          Tệp lời đọc
          <select
            aria-label="Tệp lời đọc"
            disabled={disabled || assetsQuery.isLoading}
            value={voiceover?.assetId ?? ''}
            onChange={(event) => {
              const assetId = event.target.value;

              onChange(
                assetId.length === 0
                  ? undefined
                  : {
                      assetId,
                      startAtFrame: voiceover?.startAtFrame ?? 0,
                      volume: voiceover?.volume ?? 1,
                    },
              );
            }}
            className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none focus:border-orange-400/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Không dùng lời đọc</option>
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
            Chưa có tệp âm thanh sẵn sàng. Tải lên MP3, WAV, M4A hoặc AAC từ thư viện media.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-300">
            Âm lượng ({Math.round((voiceover?.volume ?? 1) * 100)}%)
            <input
              aria-label="Âm lượng lời đọc"
              disabled={disabled || voiceover === undefined}
              max={1}
              min={0}
              step={0.05}
              type="range"
              value={voiceover?.volume ?? 1}
              onChange={(event) => {
                if (voiceover !== undefined) {
                  onChange({ ...voiceover, volume: clampVolume(Number(event.target.value)) });
                }
              }}
              className="mt-3 w-full accent-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <label className="block text-xs font-medium text-slate-300">
            Bắt đầu (frame)
            <input
              aria-label="Bắt đầu lời đọc (frame)"
              disabled={disabled || voiceover === undefined}
              min={0}
              step={1}
              type="number"
              value={voiceover?.startAtFrame ?? 0}
              onChange={(event) => {
                if (voiceover !== undefined) {
                  onChange({
                    ...voiceover,
                    startAtFrame: clampStartFrame(Number(event.target.value)),
                  });
                }
              }}
              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 font-mono text-sm text-slate-100 outline-none focus:border-orange-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="mt-1 block font-normal text-slate-500">
              {startOffsetSeconds.toFixed(2)} giây tại {fps} fps
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
