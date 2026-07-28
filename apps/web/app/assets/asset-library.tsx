'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AssetApiError,
  deleteAsset,
  fetchAssets,
  getAssetFileUrl,
  uploadAsset,
  type AssetDto,
  type AssetFilters,
  type AssetKind,
  type AssetStatus,
} from '../../src/assets/client';

const PAGE_SIZE = 12;
const ACCEPTED_MEDIA = '.png,.jpg,.jpeg,.webp,.mp4,.mov,.webm,.mp3,.wav,.m4a,.aac,.srt';

const kindLabels: Record<AssetKind, string> = {
  IMAGE: 'Hình ảnh',
  VIDEO: 'Video',
  AUDIO: 'Âm thanh',
  FONT: 'Phông chữ',
  LOGO: 'Logo',
  SUBTITLE: 'Phụ đề',
};

const statusLabels: Record<AssetStatus, string> = {
  PROCESSING: 'Đang xử lý',
  READY: 'Sẵn sàng',
  FAILED: 'Không hợp lệ',
  DELETED: 'Đã xóa',
};

const statusStyles: Record<AssetStatus, string> = {
  PROCESSING: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  READY: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  FAILED: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  DELETED: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) {
    return null;
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof AssetApiError) {
    return [error.message, ...error.details].join(' ');
  }

  return error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định.';
}

function KindMark({ kind }: { kind: AssetKind }) {
  const marks: Record<AssetKind, string> = {
    IMAGE: 'IMG',
    VIDEO: 'VID',
    AUDIO: 'AUD',
    FONT: 'FNT',
    LOGO: 'LOG',
    SUBTITLE: 'SRT',
  };

  return (
    <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.18em] text-white/70">
      {marks[kind]}
    </span>
  );
}

function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function MediaSurface({ asset, compact = false }: { asset: AssetDto; compact?: boolean }) {
  const source = getAssetFileUrl(asset.id);
  const frameClass = compact ? 'aspect-[4/3] min-h-40' : 'aspect-video min-h-52 lg:min-h-72';

  if (asset.status !== 'READY') {
    return (
      <div
        className={`${frameClass} flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_65%)]`}
      >
        <div className="text-center">
          <KindMark kind={asset.kind} />
          <p className="mt-3 text-xs text-slate-500">
            {asset.status === 'FAILED' ? 'Không thể đọc media' : 'Media đang được xử lý'}
          </p>
        </div>
      </div>
    );
  }

  if (asset.kind === 'IMAGE' || asset.kind === 'LOGO') {
    return (
      <div className={`${frameClass} overflow-hidden bg-black/40`}>
        {/* Uploaded files are streamed by the authenticated local API, so a plain img is intentional. */}
        <img
          src={source}
          alt={`Xem trước ${asset.originalName}`}
          className="h-full w-full object-contain"
          loading={compact ? 'lazy' : 'eager'}
        />
      </div>
    );
  }

  if (asset.kind === 'VIDEO') {
    return (
      <div className={`${frameClass} flex items-center bg-black`}>
        <video
          src={source}
          controls={!compact}
          muted={compact}
          preload="metadata"
          className="max-h-full w-full"
          aria-label={`Xem trước ${asset.originalName}`}
        />
      </div>
    );
  }

  if (asset.kind === 'AUDIO') {
    return (
      <div
        className={`${frameClass} flex items-center justify-center bg-[linear-gradient(135deg,#172033,#0d1119)] px-6`}
      >
        {compact ? (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-orange-300">
            ♪
          </div>
        ) : (
          <audio
            src={source}
            controls
            preload="metadata"
            className="w-full max-w-md"
            aria-label={`Nghe thử ${asset.originalName}`}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`${frameClass} flex items-center justify-center bg-[#0d1119]`}>
      <a
        href={source}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:border-orange-400/40 hover:text-white"
      >
        Mở tệp {asset.kind === 'SUBTITLE' ? 'phụ đề' : 'media'}
      </a>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-200">{children}</dd>
    </div>
  );
}

export function AssetLibrary() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [kind, setKind] = useState<AssetFilters['kind']>('');
  const [status, setStatus] = useState<AssetFilters['status']>('');
  const [page, setPage] = useState(1);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filters: AssetFilters = {
    page,
    pageSize: PAGE_SIZE,
    search: deferredSearch,
    kind,
    status,
  };
  const assetsQuery = useQuery({
    queryKey: ['assets', filters],
    queryFn: ({ signal }) => fetchAssets(filters, signal),
  });
  const uploadMutation = useMutation({
    mutationFn: uploadAsset,
    onSuccess: async (asset) => {
      setNotice(`Đã tải lên “${asset.originalName}”.`);
      setPendingFile(null);
      setSelectedAsset(asset);
      setPage(1);

      if (inputRef.current !== null) {
        inputRef.current.value = '';
      }

      await queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAsset,
    onSuccess: async (_, deletedAssetId) => {
      setNotice('Đã xóa media khỏi thư viện.');
      setSelectedAsset((current) => (current?.id === deletedAssetId ? null : current));
      await queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
  const totalPages = Math.max(1, Math.ceil((assetsQuery.data?.total ?? 0) / PAGE_SIZE));

  function resetPage(): void {
    setPage(1);
    setNotice(null);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNotice(null);

    if (pendingFile !== null) {
      await uploadMutation.mutateAsync(pendingFile).catch(() => undefined);
    }
  }

  function handleDelete(asset: AssetDto): void {
    setNotice(null);

    if (window.confirm(`Xóa “${asset.originalName}” khỏi thư viện?`)) {
      deleteMutation.mutate(asset.id);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-white/8 bg-[#090c12]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1560px] items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 font-black text-white shadow-[0_0_32px_rgba(255,90,54,0.25)]">
              H
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">HANSYS STUDIO</p>
              <p className="text-[11px] text-slate-500">Local video workspace</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
            Dữ liệu được lưu cục bộ
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1560px] px-5 py-8 sm:px-8 lg:py-10">
        <section className="flex flex-col gap-6 border-b border-white/8 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-400">
              Media workspace
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Thư viện media
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
              Tập trung hình ảnh, video, âm thanh và phụ đề dùng cho các dự án của bạn.
            </p>
          </div>

          <form
            onSubmit={(event) => void handleUpload(event)}
            className="flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 sm:flex-row sm:items-center"
          >
            <label className="min-w-0 flex-1 cursor-pointer rounded-xl border border-dashed border-white/15 bg-black/15 px-4 py-3 transition hover:border-orange-400/45">
              <span className="block truncate text-sm font-medium text-slate-200">
                {pendingFile?.name ?? 'Chọn media để tải lên'}
              </span>
              <span className="mt-1 block text-[11px] text-slate-500">
                PNG, JPEG, WebP, MP4, MOV, WebM, MP3, WAV, M4A, AAC, SRT
              </span>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_MEDIA}
                className="sr-only"
                onChange={(event) => {
                  setPendingFile(event.target.files?.[0] ?? null);
                  setNotice(null);
                  uploadMutation.reset();
                }}
              />
            </label>
            <button
              type="submit"
              disabled={pendingFile === null || uploadMutation.isPending}
              className="h-12 shrink-0 rounded-xl bg-orange-500 px-5 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(255,90,54,0.24)] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {uploadMutation.isPending ? 'Đang xử lý…' : 'Tải lên'}
            </button>
          </form>
        </section>

        <div
          aria-live="polite"
          className={`overflow-hidden transition-all ${
            notice !== null || uploadMutation.isError || deleteMutation.isError
              ? 'mt-5 max-h-40'
              : 'max-h-0'
          }`}
        >
          {notice !== null ? (
            <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-200">
              {notice}
            </p>
          ) : null}
          {uploadMutation.isError || deleteMutation.isError ? (
            <p className="rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">
              {errorMessage(uploadMutation.error ?? deleteMutation.error)}
            </p>
          ) : null}
        </div>

        <section className="mt-7">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Tìm media</span>
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-500">
                ⌕
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
                placeholder="Tìm theo tên tệp…"
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-orange-400/50 focus:ring-3 focus:ring-orange-400/10"
              />
            </label>
            <div className="grid grid-cols-2 gap-3 lg:flex">
              <label>
                <span className="sr-only">Lọc loại media</span>
                <select
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value as AssetFilters['kind']);
                    resetPage();
                  }}
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#111720] px-3 text-sm text-slate-200 outline-none focus:border-orange-400/50 lg:w-40"
                >
                  <option value="">Mọi loại</option>
                  {Object.entries(kindLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Lọc trạng thái</span>
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as AssetFilters['status']);
                    resetPage();
                  }}
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#111720] px-3 text-sm text-slate-200 outline-none focus:border-orange-400/50 lg:w-40"
                >
                  <option value="">Mọi trạng thái</option>
                  <option value="READY">Sẵn sàng</option>
                  <option value="PROCESSING">Đang xử lý</option>
                  <option value="FAILED">Không hợp lệ</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
            <p>
              {assetsQuery.isLoading
                ? 'Đang tải thư viện…'
                : `${assetsQuery.data?.total ?? 0} media`}
            </p>
            <p>
              Trang {page} / {totalPages}
            </p>
          </div>
        </section>

        {assetsQuery.isError ? (
          <section className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/8 px-5 py-8 text-center">
            <p className="text-sm text-rose-200">{errorMessage(assetsQuery.error)}</p>
            <button
              type="button"
              onClick={() => void assetsQuery.refetch()}
              className="mt-4 rounded-lg border border-rose-300/20 px-4 py-2 text-xs font-semibold text-rose-100"
            >
              Thử lại
            </button>
          </section>
        ) : null}

        {assetsQuery.isLoading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className="aspect-[4/3] animate-pulse rounded-2xl border border-white/7 bg-white/[0.035]"
              />
            ))}
          </div>
        ) : null}

        {!assetsQuery.isLoading && !assetsQuery.isError && assetsQuery.data?.items.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-dashed border-white/12 bg-white/[0.025] px-6 py-20 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl text-slate-400">
              +
            </div>
            <h2 className="mt-5 text-base font-semibold text-slate-200">Chưa có media phù hợp</h2>
            <p className="mt-2 text-sm text-slate-500">
              Tải tệp đầu tiên hoặc thay đổi bộ lọc để bắt đầu.
            </p>
          </section>
        ) : null}

        {assetsQuery.data?.items.length ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {assetsQuery.data.items.map((asset) => (
              <article
                key={asset.id}
                className="group overflow-hidden rounded-2xl border border-white/8 bg-[#10151e] shadow-[0_16px_44px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-white/16"
              >
                <button
                  type="button"
                  onClick={() => setSelectedAsset(asset)}
                  className="block w-full text-left"
                  aria-label={`Xem trước ${asset.originalName}`}
                >
                  <div className="relative overflow-hidden">
                    <MediaSurface asset={asset} compact />
                    <div className="absolute left-3 top-3">
                      <KindMark kind={asset.kind} />
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2
                        className="min-w-0 truncate text-sm font-medium text-slate-100"
                        title={asset.originalName}
                      >
                        {asset.originalName}
                      </h2>
                      <StatusBadge status={asset.status} />
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      {formatBytes(asset.sizeBytes)}
                      {asset.width !== null && asset.height !== null
                        ? ` · ${asset.width}×${asset.height}`
                        : ''}
                      {formatDuration(asset.durationMs) === null
                        ? ''
                        : ` · ${formatDuration(asset.durationMs)}`}
                    </p>
                  </div>
                </button>
                <div className="border-t border-white/7 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleDelete(asset)}
                    disabled={deleteMutation.isPending}
                    className="text-xs font-medium text-slate-500 transition hover:text-rose-300 disabled:opacity-40"
                  >
                    Xóa khỏi thư viện
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {totalPages > 1 ? (
          <nav
            aria-label="Phân trang media"
            className="mt-8 flex items-center justify-center gap-3"
          >
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 disabled:opacity-35"
            >
              Trang trước
            </button>
            <span className="text-xs text-slate-500">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 disabled:opacity-35"
            >
              Trang sau
            </button>
          </nav>
        ) : null}
      </div>

      {selectedAsset !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Chi tiết ${selectedAsset.originalName}`}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setSelectedAsset(null);
            }
          }}
        >
          <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0f141d] shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {selectedAsset.originalName}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {kindLabels[selectedAsset.kind]} · {formatBytes(selectedAsset.sizeBytes)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="ml-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Đóng xem trước"
              >
                ×
              </button>
            </div>
            <MediaSurface asset={selectedAsset} />
            <div className="grid gap-6 px-5 py-5 sm:grid-cols-[1fr_auto] sm:px-6">
              <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
                <Detail label="Trạng thái">
                  <StatusBadge status={selectedAsset.status} />
                </Detail>
                <Detail label="Định dạng">{selectedAsset.mimeType}</Detail>
                <Detail label="Kích thước">
                  {selectedAsset.width !== null && selectedAsset.height !== null
                    ? `${selectedAsset.width} × ${selectedAsset.height}`
                    : '—'}
                </Detail>
                <Detail label="Thời lượng">
                  {formatDuration(selectedAsset.durationMs) ?? '—'}
                </Detail>
              </dl>
              <button
                type="button"
                onClick={() => handleDelete(selectedAsset)}
                disabled={deleteMutation.isPending}
                className="self-end rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-2.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/14 disabled:opacity-40"
              >
                Xóa media
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
