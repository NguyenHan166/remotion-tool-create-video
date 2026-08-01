'use client';

import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import type { CaptionConfigV1, CaptionEntryV1 } from '@hansys/project-schema';
import { importSrtCaptions, ProjectApiError } from '../../../src/projects/client';
import type { ProjectAutosave } from '../../../src/projects/use-project-autosave';

function captionErrorMessage(error: unknown): string {
  if (error instanceof ProjectApiError) {
    return [error.message, ...error.details].join(' ');
  }

  return error instanceof Error ? error.message : 'Không thể nhập phụ đề SRT.';
}

function formatTimestamp(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(remainder).padStart(3, '0')}`;
}

function updateEntry(
  captions: CaptionConfigV1,
  entryId: string,
  updater: (entry: CaptionEntryV1) => CaptionEntryV1,
): CaptionConfigV1 {
  return {
    ...captions,
    entries: captions.entries
      .map((entry) => (entry.id === entryId ? updater(entry) : entry))
      .sort((left, right) => left.startMs - right.startMs),
  };
}

function CaptionRow({
  entry,
  index,
  onChange,
  onDelete,
}: {
  entry: CaptionEntryV1;
  index: number;
  onChange: (updater: (entry: CaptionEntryV1) => CaptionEntryV1) => void;
  onDelete: () => void;
}) {
  return (
    <li
      data-caption-id={entry.id}
      data-testid="caption-entry"
      className="rounded-xl border border-white/8 bg-black/15 p-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] text-slate-500">
          #{index + 1} · {formatTimestamp(entry.startMs)} → {formatTimestamp(entry.endMs)}
        </p>
        <button
          type="button"
          onClick={onDelete}
          className="text-[10px] font-semibold text-rose-300/75 transition hover:text-rose-200"
          aria-label={`Xóa phụ đề ${index + 1}`}
        >
          Xóa
        </button>
      </div>

      <textarea
        aria-label={`Nội dung phụ đề ${index + 1}`}
        value={entry.text}
        rows={2}
        maxLength={1_000}
        onChange={(event) => {
          const text = event.target.value;
          onChange((current) => ({ ...current, text }));
        }}
        className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-100 outline-none focus:border-orange-400/50"
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[10px] text-slate-500">
          Bắt đầu (ms)
          <input
            aria-label={`Thời điểm bắt đầu phụ đề ${index + 1}`}
            type="number"
            min={0}
            step={100}
            value={entry.startMs}
            onChange={(event) => {
              const startMs = Math.max(0, Math.min(entry.endMs - 1, Number(event.target.value)));
              onChange((current) => ({ ...current, startMs }));
            }}
            className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2.5 font-mono text-[11px] text-slate-200 outline-none focus:border-orange-400/50"
          />
        </label>
        <label className="text-[10px] text-slate-500">
          Kết thúc (ms)
          <input
            aria-label={`Thời điểm kết thúc phụ đề ${index + 1}`}
            type="number"
            min={entry.startMs + 1}
            step={100}
            value={entry.endMs}
            onChange={(event) => {
              const endMs = Math.max(entry.startMs + 1, Number(event.target.value));
              onChange((current) => ({ ...current, endMs }));
            }}
            className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2.5 font-mono text-[11px] text-slate-200 outline-none focus:border-orange-400/50"
          />
        </label>
      </div>
    </li>
  );
}

export function CaptionEditor({
  projectId,
  captions,
  autosave,
  projectArchived,
  onChange,
}: {
  projectId: string;
  captions: CaptionConfigV1;
  autosave: ProjectAutosave;
  projectArchived: boolean;
  onChange: (captions: CaptionConfigV1) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const importMutation = useMutation({
    mutationFn: (selectedFile: File) =>
      importSrtCaptions(projectId, autosave.draftVersion, selectedFile),
    onSuccess: (result) => {
      autosave.acceptServerProject(result.project);
      setFile(null);
      setNotice(
        result.warnings.length === 0
          ? `Đã nhập ${result.project.document.captions.entries.length} câu phụ đề.`
          : `Đã nhập phụ đề với ${result.warnings.length} cảnh báo chồng thời gian.`,
      );

      if (inputRef.current !== null) {
        inputRef.current.value = '';
      }
    },
    onError: (error) => {
      if (
        error instanceof ProjectApiError &&
        error.status === 409 &&
        error.code === 'PROJECT_VERSION_CONFLICT'
      ) {
        autosave.handleVersionConflict(captionErrorMessage(error));
      }
    },
  });
  const importDisabled =
    file === null || autosave.phase !== 'saved' || projectArchived || importMutation.isPending;

  function submitImport(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setNotice(null);

    if (!importDisabled && file !== null) {
      importMutation.mutate(file);
    }
  }

  function addCaption(): void {
    const lastEntry = captions.entries.at(-1);
    const startMs = (lastEntry?.endMs ?? 0) + (lastEntry === undefined ? 0 : 250);

    onChange({
      ...captions,
      enabled: true,
      source: captions.source === 'none' ? 'manual' : captions.source,
      entries: [
        ...captions.entries,
        {
          id: crypto.randomUUID(),
          startMs,
          endMs: startMs + 2_000,
          text: 'Nội dung phụ đề mới',
        },
      ],
    });
  }

  return (
    <section
      data-testid="caption-editor"
      className="mt-5 rounded-2xl border border-white/10 bg-[#10151e] p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">
            Captions
          </p>
          <h2 className="mt-2 text-base font-semibold text-white">Phụ đề video</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Nhập SRT UTF-8 hoặc chỉnh trực tiếp từng mốc thời gian.
          </p>
        </div>

        <form onSubmit={submitImport} className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <label className="min-w-0 cursor-pointer rounded-xl border border-dashed border-white/12 bg-black/15 px-3 py-2.5">
            <span className="block max-w-56 truncate text-xs font-medium text-slate-300">
              {file?.name ?? 'Chọn tệp .srt'}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".srt,application/x-subrip,text/plain"
              className="sr-only"
              aria-label="Tệp phụ đề SRT"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setNotice(null);
                importMutation.reset();
              }}
            />
          </label>
          <button
            type="submit"
            disabled={importDisabled}
            className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {importMutation.isPending ? 'Đang nhập…' : 'Nhập SRT'}
          </button>
        </form>
      </div>

      {autosave.phase !== 'saved' ? (
        <p className="mt-3 text-[11px] text-amber-200/75">
          Hoàn tất lưu bản nháp trước khi nhập SRT.
        </p>
      ) : null}
      {notice !== null ? (
        <p
          aria-live="polite"
          className="mt-3 rounded-lg border border-emerald-400/15 bg-emerald-400/7 px-3 py-2 text-xs text-emerald-200"
        >
          {notice}
        </p>
      ) : null}
      {importMutation.isError ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-rose-400/15 bg-rose-400/7 px-3 py-2 text-xs leading-5 text-rose-200"
        >
          {captionErrorMessage(importMutation.error)}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 border-t border-white/8 pt-5 sm:grid-cols-2 xl:grid-cols-4">
        <label className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/10 px-3 py-2.5 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={captions.enabled}
            onChange={(event) => onChange({ ...captions, enabled: event.target.checked })}
            disabled={projectArchived}
          />
          Bật phụ đề
        </label>
        <label className="text-[10px] text-slate-500">
          Phong cách
          <select
            value={captions.style}
            onChange={(event) =>
              onChange({
                ...captions,
                style: event.target.value as CaptionConfigV1['style'],
              })
            }
            disabled={projectArchived}
            className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-[#111720] px-2.5 text-xs text-slate-200"
          >
            <option value="clean">Clean</option>
            <option value="tiktok">TikTok</option>
            <option value="news">News</option>
          </select>
        </label>
        <label className="text-[10px] text-slate-500">
          Vị trí
          <select
            value={captions.options.position}
            onChange={(event) =>
              onChange({
                ...captions,
                options: {
                  ...captions.options,
                  position: event.target.value as CaptionConfigV1['options']['position'],
                },
              })
            }
            disabled={projectArchived}
            className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-[#111720] px-2.5 text-xs text-slate-200"
          >
            <option value="top">Phía trên</option>
            <option value="center">Chính giữa</option>
            <option value="bottom">Phía dưới</option>
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/10 px-3 py-2.5 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={captions.options.highlightCurrentWord}
            onChange={(event) =>
              onChange({
                ...captions,
                options: {
                  ...captions.options,
                  highlightCurrentWord: event.target.checked,
                },
              })
            }
            disabled={projectArchived}
          />
          Nhấn từ hiện tại
        </label>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">{captions.entries.length} câu phụ đề</p>
        <button
          type="button"
          onClick={addCaption}
          disabled={projectArchived}
          className="rounded-lg border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:bg-white/5 disabled:opacity-45"
        >
          Thêm câu
        </button>
      </div>

      {captions.entries.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-white/10 px-5 py-10 text-center">
          <p className="text-xs font-medium text-slate-300">Chưa có phụ đề</p>
          <p className="mt-1 text-[11px] text-slate-500">Nhập tệp SRT hoặc thêm câu thủ công.</p>
        </div>
      ) : (
        <ol className="mt-3 grid max-h-[620px] gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
          {captions.entries.map((entry, index) => (
            <CaptionRow
              key={entry.id}
              entry={entry}
              index={index}
              onChange={(updater) => onChange(updateEntry(captions, entry.id, updater))}
              onDelete={() =>
                onChange({
                  ...captions,
                  entries: captions.entries.filter((candidate) => candidate.id !== entry.id),
                })
              }
            />
          ))}
        </ol>
      )}
    </section>
  );
}
