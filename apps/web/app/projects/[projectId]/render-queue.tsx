'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { AutosavePhase } from '../../../src/projects/autosave-state';
import {
  RenderApiError,
  cancelRender,
  createRender,
  fetchRenders,
  getRenderDownloadUrl,
  getRenderDiagnosticUrl,
  getRenderPollingInterval,
  getRenderProgressPercent,
  getRenderThumbnailUrl,
  isActiveRenderStatus,
  retryRender,
  type RenderJobDto,
  type RenderJobPageDto,
  type RenderPreset,
  type RenderStatus,
} from '../../../src/renders/client';

const PAGE_SIZE = 10;

const statusCopy: Record<RenderStatus, { label: string; className: string }> = {
  QUEUED: {
    label: 'Đang chờ',
    className: 'border-slate-400/20 bg-slate-400/8 text-slate-300',
  },
  PREPARING: {
    label: 'Chuẩn bị',
    className: 'border-sky-400/20 bg-sky-400/8 text-sky-200',
  },
  BUNDLING: {
    label: 'Đóng gói',
    className: 'border-indigo-400/20 bg-indigo-400/8 text-indigo-200',
  },
  RENDERING: {
    label: 'Đang render',
    className: 'border-orange-400/25 bg-orange-400/10 text-orange-200',
  },
  ENCODING: {
    label: 'Mã hóa',
    className: 'border-violet-400/20 bg-violet-400/8 text-violet-200',
  },
  COMPLETED: {
    label: 'Hoàn tất',
    className: 'border-emerald-400/20 bg-emerald-400/8 text-emerald-200',
  },
  FAILED: {
    label: 'Thất bại',
    className: 'border-rose-400/20 bg-rose-400/8 text-rose-200',
  },
  CANCEL_REQUESTED: {
    label: 'Đang hủy',
    className: 'border-amber-400/20 bg-amber-400/8 text-amber-200',
  },
  CANCELLED: {
    label: 'Đã hủy',
    className: 'border-slate-400/20 bg-slate-400/8 text-slate-400',
  },
};

const presetCopy: Record<RenderPreset, string> = {
  draft: 'Bản nháp · nhanh',
  'vertical-h264': 'H.264 · tiêu chuẩn',
  'vertical-high': 'H.264 · chất lượng cao',
};

function renderErrorMessage(error: unknown): string {
  if (error instanceof RenderApiError) {
    return [error.message, ...error.details].join(' ');
  }

  return error instanceof Error ? error.message : 'Không thể cập nhật hàng đợi render.';
}

function updateJobPage(
  page: RenderJobPageDto | undefined,
  job: RenderJobDto,
  addIfMissing: boolean,
): RenderJobPageDto | undefined {
  if (page === undefined) {
    return page;
  }

  const existingIndex = page.items.findIndex((candidate) => candidate.id === job.id);

  if (existingIndex === -1) {
    return addIfMissing
      ? {
          ...page,
          items: [job, ...page.items].slice(0, page.pageSize),
          total: page.total + 1,
        }
      : page;
  }

  return {
    ...page,
    items: page.items.map((candidate) => (candidate.id === job.id ? job : candidate)),
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];

  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Không rõ thời gian';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function RenderJobCard({
  job,
  actionPending,
  onCancel,
  onRetry,
}: {
  job: RenderJobDto;
  actionPending: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const status = statusCopy[job.status];
  const progress = getRenderProgressPercent(job.progress);
  const video = job.outputs.find((output) => output.kind === 'VIDEO');
  const thumbnail = job.outputs.find((output) => output.kind === 'THUMBNAIL');
  const diagnostic = job.outputs.find((output) => output.kind === 'LOG');
  const canCancel = isActiveRenderStatus(job.status) && job.status !== 'CANCEL_REQUESTED';
  const canRetry = job.status === 'FAILED' || job.status === 'CANCELLED';

  return (
    <article
      data-status={job.status}
      data-testid="render-job"
      className="overflow-hidden rounded-xl border border-white/8 bg-black/15"
    >
      {job.status === 'COMPLETED' && thumbnail !== undefined ? (
        <a href={getRenderThumbnailUrl(job.id)} target="_blank" rel="noreferrer">
          {/* Final thumbnails are streamed from the local render output API. */}
          <img
            src={getRenderThumbnailUrl(job.id)}
            alt={`Thumbnail render ${job.id.slice(0, 8)}`}
            className="aspect-video w-full bg-black object-cover"
          />
        </a>
      ) : null}

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] text-slate-500">#{job.id.slice(0, 8)}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {formatCreatedAt(job.createdAt)} · lần {job.attempt}/{job.maxAttempts}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${status.className}`}
          >
            {status.label}
          </span>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>{job.stageMessage ?? 'Đang chờ worker xử lý.'}</span>
            <span className="font-mono text-slate-400">{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Tiến độ render ${job.id.slice(0, 8)}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/7"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                job.status === 'FAILED'
                  ? 'bg-rose-400'
                  : job.status === 'COMPLETED'
                    ? 'bg-emerald-400'
                    : 'bg-orange-400'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {job.totalFrames !== null ? (
            <p className="mt-2 font-mono text-[10px] text-slate-600">
              {job.renderedFrames ?? 0}/{job.totalFrames} frame · đã mã hóa {job.encodedFrames ?? 0}
            </p>
          ) : null}
        </div>

        {job.status === 'FAILED' ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-rose-400/15 bg-rose-400/7 px-3 py-2.5"
          >
            <p className="font-mono text-[10px] font-semibold text-rose-300">
              {job.errorCode ?? 'RENDER_FAILED'}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-rose-100/75">
              {job.errorMessage ?? 'Render không thể hoàn tất.'}
            </p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {job.status === 'COMPLETED' && video !== undefined ? (
            <a
              href={getRenderDownloadUrl(job.id)}
              download={video.fileName}
              className="rounded-lg bg-emerald-400/15 px-3 py-2 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/25"
            >
              Tải MP4 · {formatBytes(video.sizeBytes)}
            </a>
          ) : null}
          {job.status === 'COMPLETED' && thumbnail !== undefined ? (
            <a
              href={getRenderThumbnailUrl(job.id)}
              download={thumbnail.fileName}
              className="rounded-lg border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5"
            >
              Tải thumbnail
            </a>
          ) : null}
          {diagnostic !== undefined ? (
            <a
              href={getRenderDiagnosticUrl(job.id)}
              download={diagnostic.fileName}
              className="rounded-lg border border-rose-400/20 px-3 py-2 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-400/10"
            >
              Táº£i diagnostics
            </a>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={actionPending}
              className="rounded-lg border border-amber-400/20 px-3 py-2 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-45"
            >
              {actionPending ? 'Đang gửi…' : 'Hủy render'}
            </button>
          ) : null}
          {canRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={actionPending}
              className="rounded-lg bg-orange-500 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-orange-400 disabled:opacity-45"
            >
              {actionPending ? 'Đang gửi…' : 'Render lại'}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function RenderQueue({
  projectId,
  initialPreset,
  autosavePhase,
  projectArchived,
}: {
  projectId: string;
  initialPreset: RenderPreset;
  autosavePhase: AutosavePhase;
  projectArchived: boolean;
}) {
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState<RenderPreset>(initialPreset);
  const queryKey = ['renders', projectId] as const;
  const rendersQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchRenders({ projectId, pageSize: PAGE_SIZE }, signal),
    refetchInterval: (query) => getRenderPollingInterval(query.state.data),
  });
  const createMutation = useMutation({
    mutationFn: () => createRender(projectId, preset),
    onSuccess: async (job) => {
      queryClient.setQueryData<RenderJobPageDto>(queryKey, (page) =>
        updateJobPage(page, job, true),
      );
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const actionMutation = useMutation({
    mutationFn: ({ renderId, action }: { renderId: string; action: 'cancel' | 'retry' }) =>
      action === 'cancel' ? cancelRender(renderId) : retryRender(renderId),
    onSuccess: async (job) => {
      queryClient.setQueryData<RenderJobPageDto>(queryKey, (page) =>
        updateJobPage(page, job, false),
      );
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const createDisabled = autosavePhase !== 'saved' || projectArchived || createMutation.isPending;
  const mutationError = createMutation.error ?? actionMutation.error;

  return (
    <section
      id="render-queue"
      data-testid="render-queue"
      className="mt-4 rounded-2xl border border-white/10 bg-[#10151e] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-white">Hàng đợi render</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {rendersQuery.data?.total ?? 0} bản kết xuất
          </p>
        </div>
        <button
          type="button"
          onClick={() => void rendersQuery.refetch()}
          disabled={rendersQuery.isFetching}
          className="rounded-lg border border-white/8 px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 transition hover:text-white disabled:opacity-45"
          aria-label="Làm mới hàng đợi render"
        >
          {rendersQuery.isFetching ? 'Đang tải…' : 'Làm mới'}
        </button>
      </div>

      <label className="mt-4 block text-[11px] font-medium text-slate-400">
        Chất lượng kết xuất
        <select
          value={preset}
          onChange={(event) => setPreset(event.target.value as RenderPreset)}
          disabled={createMutation.isPending}
          className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-[#111720] px-3 text-xs text-slate-200 outline-none focus:border-orange-400/50"
        >
          {Object.entries(presetCopy).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => createMutation.mutate()}
        disabled={createDisabled}
        className="mt-3 w-full rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_8px_24px_rgba(255,90,54,0.2)] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {createMutation.isPending ? 'Đang tạo revision…' : 'Tạo bản render'}
      </button>

      {autosavePhase !== 'saved' ? (
        <p className="mt-2 text-[10px] leading-4 text-amber-200/75">
          Hoàn tất lưu bản nháp trước khi tạo render.
        </p>
      ) : null}
      {projectArchived ? (
        <p className="mt-2 text-[10px] leading-4 text-slate-500">
          Dự án đã lưu trữ không thể tạo render mới.
        </p>
      ) : null}

      {mutationError !== null ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-rose-400/15 bg-rose-400/7 px-3 py-2 text-[11px] leading-5 text-rose-200"
        >
          {renderErrorMessage(mutationError)}
        </p>
      ) : null}

      {rendersQuery.isError ? (
        <div role="alert" className="mt-4 rounded-xl border border-rose-400/15 p-3 text-center">
          <p className="text-[11px] leading-5 text-rose-200">
            {renderErrorMessage(rendersQuery.error)}
          </p>
          <button
            type="button"
            onClick={() => void rendersQuery.refetch()}
            className="mt-2 text-[11px] font-semibold text-rose-100 underline underline-offset-4"
          >
            Thử lại
          </button>
        </div>
      ) : null}

      {rendersQuery.isLoading ? (
        <div className="mt-4 space-y-2">
          <div className="h-24 animate-pulse rounded-xl bg-white/[0.035]" />
          <div className="h-24 animate-pulse rounded-xl bg-white/[0.035]" />
        </div>
      ) : null}

      {!rendersQuery.isLoading && !rendersQuery.isError && rendersQuery.data?.items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-7 text-center">
          <p className="text-xs font-medium text-slate-300">Chưa có bản render</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            Chọn chất lượng và tạo bản đầu tiên từ revision đã lưu.
          </p>
        </div>
      ) : null}

      {rendersQuery.data?.items.length ? (
        <div className="mt-4 max-h-[720px] space-y-3 overflow-y-auto pr-1">
          {rendersQuery.data.items.map((job) => (
            <RenderJobCard
              key={job.id}
              job={job}
              actionPending={
                actionMutation.isPending && actionMutation.variables?.renderId === job.id
              }
              onCancel={() => actionMutation.mutate({ renderId: job.id, action: 'cancel' })}
              onRetry={() => actionMutation.mutate({ renderId: job.id, action: 'retry' })}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
