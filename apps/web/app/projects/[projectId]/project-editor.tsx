'use client';

import { Player } from '@remotion/player';
import { useQuery } from '@tanstack/react-query';
import { ProjectVideo, getTotalDurationInFrames } from '@hansys/video';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ProjectApiError,
  createPreviewProps,
  fetchProject,
  getResponsivePlayerMaxWidth,
  type ProjectDto,
} from '../../../src/projects/client';
import {
  addScene,
  createSceneEditorState,
  deleteSelectedScene,
  duplicateSelectedScene,
  getSelectedScene,
  moveSelectedScene,
  selectScene,
  updateSelectedSceneHeadline,
} from '../../../src/projects/editor-state';
import { SceneList } from './scene-list';

function projectErrorMessage(error: unknown): string {
  if (error instanceof ProjectApiError) {
    return [error.message, ...error.details].join(' ');
  }

  return error instanceof Error ? error.message : 'Không thể tải dự án.';
}

function PreviewError({ error }: { error: Error }) {
  return (
    <div
      role="alert"
      className="flex h-full min-h-80 w-full items-center justify-center bg-[#0b0e14] p-8 text-center"
    >
      <div className="max-w-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-400/10 text-xl text-rose-300">
          !
        </div>
        <h2 className="mt-4 text-base font-semibold text-white">
          Không thể hiển thị bản xem trước
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{error.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
        >
          Tải lại editor
        </button>
      </div>
    </div>
  );
}

function LoadedProjectEditor({ project }: { project: ProjectDto }) {
  const [editorState, setEditorState] = useState(() =>
    createSceneEditorState(structuredClone(project.document)),
  );
  const draft = editorState.document;
  const selectedScene = getSelectedScene(editorState);
  const durationInFrames = getTotalDurationInFrames(draft);
  const inputProps = useMemo(() => createPreviewProps(draft), [draft]);
  const maximumPlayerWidth = getResponsivePlayerMaxWidth(
    draft.composition.width,
    draft.composition.height,
  );

  return (
    <main className="min-h-screen">
      <header className="border-b border-white/8 bg-[#090c12]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 font-black text-white shadow-[0_0_32px_rgba(255,90,54,0.25)]">
              H
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-wide text-white">
                {project.name}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Bản nháp v{project.draftVersion} · Xem trước trực tiếp
              </p>
            </div>
          </div>
          <Link
            href="/assets"
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            Thư viện media
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1680px] gap-6 px-5 py-6 sm:px-8 lg:py-8 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="min-w-0">
          <SceneList
            state={editorState}
            fps={draft.composition.fps}
            onAdd={() => {
              setEditorState((current) => addScene(current, crypto.randomUUID()));
            }}
            onDelete={() => {
              setEditorState(deleteSelectedScene);
            }}
            onDuplicate={() => {
              setEditorState((current) => duplicateSelectedScene(current, crypto.randomUUID()));
            }}
            onMoveDown={() => {
              setEditorState((current) => moveSelectedScene(current, 'down'));
            }}
            onMoveUp={() => {
              setEditorState((current) => moveSelectedScene(current, 'up'));
            }}
            onSelect={(sceneId) => {
              setEditorState((current) => selectScene(current, sceneId));
            }}
          />
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
                Live composition
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Xem trước dự án
              </h1>
            </div>
            <p className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 font-mono text-[11px] text-slate-400">
              {draft.composition.width}×{draft.composition.height} · {draft.composition.fps} fps
            </p>
          </div>

          <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-[#05070a] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.32)] sm:p-5">
            <div
              data-testid="remotion-player"
              className="w-full overflow-hidden rounded-2xl bg-black shadow-2xl"
              style={{
                aspectRatio: `${draft.composition.width} / ${draft.composition.height}`,
                maxWidth: maximumPlayerWidth,
              }}
            >
              <Player
                acknowledgeRemotionLicense
                allowFullscreen
                clickToPlay
                component={ProjectVideo}
                compositionHeight={draft.composition.height}
                compositionWidth={draft.composition.width}
                controls
                durationInFrames={durationInFrames}
                errorFallback={({ error }) => <PreviewError error={error} />}
                fps={draft.composition.fps}
                initialFrame={Math.min(15, durationInFrames - 1)}
                inputProps={inputProps}
                initiallyMuted={draft.export.muted}
                showVolumeControls
                spaceKeyToPlayOrPause
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </div>
        </section>

        <aside className="min-w-0">
          <section className="rounded-2xl border border-white/10 bg-[#10151e] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Scene đang xem
                </p>
                <h2 className="mt-1 text-base font-semibold text-white">{selectedScene.name}</h2>
              </div>
              <span className="rounded-lg border border-orange-400/20 bg-orange-400/8 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-orange-300">
                {selectedScene.type}
              </span>
            </div>

            <label className="mt-6 block">
              <span className="text-xs font-medium text-slate-300">
                Tiêu đề scene đang xem trước
              </span>
              <textarea
                value={selectedScene.text.headline ?? ''}
                maxLength={300}
                rows={6}
                onChange={(event) => {
                  const headline = event.target.value;
                  setEditorState((current) => updateSelectedSceneHeadline(current, headline));
                }}
                className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-orange-400/50 focus:ring-3 focus:ring-orange-400/10"
                placeholder="Nhập tiêu đề để xem Player cập nhật ngay…"
              />
            </label>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
              <span>Cập nhật trực tiếp, không render MP4</span>
              <span>{selectedScene.text.headline?.length ?? 0}/300</span>
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-sky-400/15 bg-sky-400/[0.055] p-4">
            <p className="text-xs font-semibold text-sky-200">Bản nháp cục bộ</p>
            <p className="mt-1.5 text-xs leading-5 text-slate-400">
              Thay đổi trong commit này chỉ cập nhật Player. Lưu tự động sẽ được nối ở bước
              autosave.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

export function ProjectEditor({ projectId }: { projectId: string }) {
  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: ({ signal }) => fetchProject(projectId, signal),
  });

  if (projectQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-orange-400" />
          <p className="mt-4 text-sm text-slate-400">Đang mở project editor…</p>
        </div>
      </main>
    );
  }

  if (projectQuery.isError || projectQuery.data === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <section
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-rose-400/20 bg-rose-400/8 p-7 text-center"
        >
          <h1 className="text-lg font-semibold text-white">Không thể mở dự án</h1>
          <p className="mt-2 text-sm leading-6 text-rose-100/75">
            {projectErrorMessage(projectQuery.error)}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href="/assets"
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300"
            >
              Về thư viện
            </Link>
            <button
              type="button"
              onClick={() => void projectQuery.refetch()}
              className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white"
            >
              Thử lại
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <LoadedProjectEditor
      key={`${projectQuery.data.id}:${projectQuery.data.draftVersion}`}
      project={projectQuery.data}
    />
  );
}
