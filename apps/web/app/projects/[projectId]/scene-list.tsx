import { type SceneEditorState } from '../../../src/projects/editor-state';

type SceneListProps = {
  state: SceneEditorState;
  fps: number;
  onAdd: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onSelect: (sceneId: string) => void;
};

function formatDuration(durationInFrames: number, fps: number): string {
  const seconds = durationInFrames / fps;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
}

export function SceneList({
  state,
  fps,
  onAdd,
  onDelete,
  onDuplicate,
  onMoveDown,
  onMoveUp,
  onSelect,
}: SceneListProps) {
  const selectedIndex = state.document.scenes.findIndex(
    (scene) => scene.id === state.selectedSceneId,
  );
  const sceneLimitReached = state.document.scenes.length >= 100;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#10151e] shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Cấu trúc video
          </p>
          <h2 className="mt-1 text-sm font-semibold text-white">
            {state.document.scenes.length} scene
          </h2>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={sceneLimitReached}
          className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Thêm scene"
        >
          + Thêm
        </button>
      </div>

      <ol className="max-h-[min(68vh,760px)] space-y-2 overflow-y-auto p-3">
        {state.document.scenes.map((scene, index) => {
          const selected = scene.id === state.selectedSceneId;

          return (
            <li
              key={scene.id}
              data-testid="scene-list-item"
              data-scene-id={scene.id}
              className={`overflow-hidden rounded-xl border transition ${
                selected
                  ? 'border-orange-400/45 bg-orange-400/[0.075]'
                  : 'border-white/7 bg-black/10 hover:border-white/14'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(scene.id)}
                aria-label={`Chọn scene ${scene.name}`}
                aria-current={selected ? 'true' : undefined}
                className="flex w-full items-start gap-3 p-3 text-left"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[10px] font-semibold ${
                    selected
                      ? 'bg-orange-400 text-slate-950'
                      : 'border border-white/8 bg-white/5 text-slate-500'
                  }`}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-100">
                    {scene.name}
                  </span>
                  <span className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-slate-500">
                    <span>{scene.type}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDuration(scene.durationInFrames, fps)}</span>
                    {!scene.enabled ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Tắt</span>
                      </>
                    ) : null}
                  </span>
                </span>
              </button>

              {selected ? (
                <div className="grid grid-cols-4 gap-1 border-t border-orange-400/15 p-2">
                  <button
                    type="button"
                    onClick={onMoveUp}
                    disabled={selectedIndex <= 0}
                    className="rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:bg-white/7 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                    aria-label="Di chuyển scene lên"
                    title="Di chuyển lên"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={onMoveDown}
                    disabled={selectedIndex >= state.document.scenes.length - 1}
                    className="rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:bg-white/7 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                    aria-label="Di chuyển scene xuống"
                    title="Di chuyển xuống"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={onDuplicate}
                    disabled={sceneLimitReached}
                    className="rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:bg-white/7 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                    aria-label="Nhân bản scene"
                    title="Nhân bản"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={state.document.scenes.length <= 1}
                    className="rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-25"
                    aria-label="Xóa scene"
                    title="Xóa"
                  >
                    ×
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
