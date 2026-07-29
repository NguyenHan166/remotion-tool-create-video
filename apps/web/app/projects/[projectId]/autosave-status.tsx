'use client';

import { type ProjectAutosave } from '../../../src/projects/use-project-autosave';

const statusCopy = {
  saved: {
    label: 'Đã lưu',
    className: 'border-emerald-400/20 bg-emerald-400/8 text-emerald-200',
  },
  dirty: {
    label: 'Đang chờ lưu',
    className: 'border-amber-400/20 bg-amber-400/8 text-amber-200',
  },
  saving: {
    label: 'Đang lưu…',
    className: 'border-sky-400/20 bg-sky-400/8 text-sky-200',
  },
  error: {
    label: 'Lỗi lưu',
    className: 'border-rose-400/20 bg-rose-400/8 text-rose-200',
  },
  conflict: {
    label: 'Xung đột phiên bản',
    className: 'border-orange-400/25 bg-orange-400/10 text-orange-200',
  },
} as const;

export function AutosaveStatus({ autosave }: { autosave: ProjectAutosave }) {
  const status = statusCopy[autosave.phase];

  return (
    <section
      data-phase={autosave.phase}
      data-testid="autosave-status"
      className="mt-4 rounded-2xl border border-white/10 bg-[#10151e] p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-white">Lưu tự động</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Bản nháp máy chủ v{autosave.draftVersion}
          </p>
        </div>
        <span
          aria-live="polite"
          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      {autosave.phase === 'error' ? (
        <div role="alert" className="mt-4 border-t border-white/8 pt-4">
          <p className="text-xs leading-5 text-rose-200">
            {autosave.message ?? 'Không thể lưu bản nháp.'}
          </p>
          <button
            type="button"
            onClick={autosave.retry}
            className="mt-3 rounded-lg bg-rose-400/15 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/25"
          >
            Thử lưu lại
          </button>
        </div>
      ) : null}

      {autosave.phase === 'conflict' ? (
        <div role="alert" className="mt-4 border-t border-orange-400/15 pt-4">
          <p className="text-xs font-semibold text-orange-100">
            Project đã thay đổi ở tab hoặc phiên làm việc khác.
          </p>
          <p className="mt-1.5 text-xs leading-5 text-slate-400">
            Thay đổi cục bộ vẫn được giữ. Hãy chọn bản cần tiếp tục trước khi lưu thêm.
          </p>

          {autosave.conflict.phase === 'loading' ? (
            <p className="mt-3 text-xs text-slate-500">Đang tải bản mới nhất…</p>
          ) : null}

          {autosave.conflict.phase === 'error' ? (
            <>
              <p className="mt-3 text-xs leading-5 text-rose-200">{autosave.conflict.message}</p>
              <button
                type="button"
                onClick={autosave.reloadConflict}
                className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
              >
                Tải lại phiên bản
              </button>
            </>
          ) : null}

          {autosave.conflict.phase === 'ready' ? (
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={autosave.useRemote}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Dùng bản máy chủ v{autosave.conflict.project.draftVersion}
              </button>
              <button
                type="button"
                onClick={autosave.keepLocal}
                className="w-full rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-400"
              >
                Lưu bản của tôi lên v{autosave.conflict.project.draftVersion}
              </button>
              <p className="text-[10px] leading-4 text-slate-500">
                “Lưu bản của tôi” sẽ thay thế nội dung mới nhất trên máy chủ.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
