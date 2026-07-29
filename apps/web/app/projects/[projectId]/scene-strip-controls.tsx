'use client';

import { formatPlayerTime, type SceneTimelineItem } from '../../../src/projects/player-timeline';

export function SceneStripControls({
  timeline,
  activeSceneId,
  currentFrame,
  totalFrames,
  fps,
  isMuted,
  isPlaying,
  onSeek,
  onSeekPrevious,
  onSeekNext,
  onToggleMute,
  onTogglePlay,
}: {
  timeline: readonly SceneTimelineItem[];
  activeSceneId: string | null;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  isMuted: boolean;
  isPlaying: boolean;
  onSeek: (frame: number, sceneId?: string) => void;
  onSeekPrevious: () => void;
  onSeekNext: () => void;
  onToggleMute: () => void;
  onTogglePlay: () => void;
}) {
  const activeIndex = timeline.findIndex((item) => item.sceneId === activeSceneId);
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < timeline.length - 1;

  return (
    <section
      aria-label="Scene strip và điều khiển Player"
      className="mt-4 rounded-2xl border border-white/10 bg-[#0b0f16] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.2)]"
    >
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2" data-testid="scene-strip">
          {timeline.map((item, index) => {
            const isActive = item.sceneId === activeSceneId;

            return (
              <button
                key={item.sceneId}
                type="button"
                aria-current={isActive ? 'true' : undefined}
                aria-label={`Tua đến scene ${item.name}`}
                data-active={isActive ? 'true' : 'false'}
                data-scene-id={item.sceneId}
                data-start-frame={item.startFrame}
                data-testid="scene-strip-item"
                onClick={() => {
                  onSeek(item.startFrame, item.sceneId);
                }}
                className={`min-w-32 rounded-xl border px-3 py-2.5 text-left transition ${
                  isActive
                    ? 'border-orange-400/55 bg-orange-400/12 text-white shadow-[0_0_24px_rgba(251,146,60,0.12)]'
                    : 'border-white/8 bg-white/[0.025] text-slate-400 hover:border-white/18 hover:text-slate-200'
                }`}
                style={{
                  flexGrow: item.durationInFrames,
                  flexBasis: 0,
                }}
              >
                <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {String(index + 1).padStart(2, '0')} · {item.type}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold">{item.name}</span>
                <span className="mt-1 block font-mono text-[9px] text-slate-500">
                  f{item.startFrame} · {(item.durationInFrames / fps).toFixed(1)}s
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-2 block">
        <span className="sr-only">Tua theo thời gian</span>
        <input
          aria-label="Tua theo thời gian"
          max={Math.max(0, totalFrames - 1)}
          min={0}
          step={1}
          type="range"
          value={currentFrame}
          onChange={(event) => {
            onSeek(event.currentTarget.valueAsNumber);
          }}
          className="h-1.5 w-full cursor-pointer accent-orange-500"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
            onClick={onTogglePlay}
            className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-400"
          >
            {isPlaying ? 'Tạm dừng' : 'Phát'}
          </button>
          <button
            type="button"
            aria-label="Scene trước"
            disabled={!hasPrevious}
            onClick={onSeekPrevious}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
          >
            ← Trước
          </button>
          <button
            type="button"
            aria-label="Scene tiếp theo"
            disabled={!hasNext}
            onClick={onSeekNext}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Tiếp →
          </button>
          <button
            type="button"
            aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
            aria-pressed={isMuted}
            onClick={onToggleMute}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
          >
            {isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
          </button>
        </div>

        <p
          aria-live="off"
          data-frame={currentFrame}
          data-testid="player-time"
          className="font-mono text-[11px] text-slate-400"
        >
          {formatPlayerTime(currentFrame, fps)}
          <span className="mx-1.5 text-slate-700">/</span>
          {formatPlayerTime(totalFrames, fps)}
          <span className="ml-2 text-slate-600">frame {currentFrame}</span>
        </p>
      </div>
    </section>
  );
}
