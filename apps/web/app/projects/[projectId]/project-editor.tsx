'use client';

import { Player, type PlayerRef } from '@remotion/player';
import { useQuery } from '@tanstack/react-query';
import { ProjectVideo, getTotalDurationInFrames } from '@hansys/video';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ProjectApiError,
  createPreviewProps,
  fetchProject,
  getResponsivePlayerMaxWidth,
  type ProjectDto,
} from '../../../src/projects/client';
import { setProjectBackgroundMusic, setProjectVoiceover } from '../../../src/projects/audio';
import {
  addScene,
  createSceneEditorDraftState,
  deleteSelectedScene,
  duplicateSelectedScene,
  moveSelectedScene,
  replaceSceneEditorDraft,
  selectScene,
  updateSceneEditorDraft,
  type SceneEditorDraftState,
  type SceneEditorStateUpdater,
} from '../../../src/projects/editor-state';
import {
  clampPlayerFrame,
  createSceneTimeline,
  getActiveTimelineItem,
  getAdjacentSceneStartFrame,
  type SceneSeekDirection,
} from '../../../src/projects/player-timeline';
import { useProjectAutosave } from '../../../src/projects/use-project-autosave';
import { AutosaveStatus } from './autosave-status';
import { CaptionEditor } from './caption-editor';
import { BackgroundMusicEditor } from './background-music-editor';
import { RenderQueue } from './render-queue';
import { SceneInspector } from './scene-inspector';
import { SceneList } from './scene-list';
import { SceneStripControls } from './scene-strip-controls';
import { VoiceoverEditor } from './voiceover-editor';

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

type EditorDraftAction =
  | {
      type: 'update';
      updater: SceneEditorStateUpdater;
    }
  | {
      type: 'replace';
      project: ProjectDto;
    };

function reduceEditorDraft(
  state: SceneEditorDraftState,
  action: EditorDraftAction,
): SceneEditorDraftState {
  if (action.type === 'replace') {
    return replaceSceneEditorDraft(state, structuredClone(action.project.document));
  }

  return updateSceneEditorDraft(state, action.updater);
}

function LoadedProjectEditor({
  project,
  autoSaveDelayMs,
}: {
  project: ProjectDto;
  autoSaveDelayMs: number;
}) {
  const [draftState, dispatchDraft] = useReducer(reduceEditorDraft, project.document, (document) =>
    createSceneEditorDraftState(structuredClone(document)),
  );
  const editorState = draftState.editor;
  const draft = editorState.document;
  const useRemoteProject = useCallback((remoteProject: ProjectDto) => {
    dispatchDraft({
      type: 'replace',
      project: remoteProject,
    });
  }, []);
  const autosave = useProjectAutosave({
    projectId: project.id,
    initialDraftVersion: project.draftVersion,
    document: draft,
    changeSequence: draftState.changeSequence,
    delayMs: autoSaveDelayMs,
    onUseRemote: useRemoteProject,
  });
  const updateEditor = useCallback((updater: SceneEditorStateUpdater) => {
    dispatchDraft({
      type: 'update',
      updater,
    });
  }, []);
  const durationInFrames = getTotalDurationInFrames(draft);
  const initialPlayerFrame = Math.min(15, durationInFrames - 1);
  const playerRef = useRef<PlayerRef>(null);
  const [currentFrame, setCurrentFrame] = useState(initialPlayerFrame);
  const [isMuted, setIsMuted] = useState(draft.export.muted);
  const [isPlaying, setIsPlaying] = useState(false);
  const timeline = useMemo(() => createSceneTimeline(draft), [draft]);
  const activeTimelineItem = useMemo(
    () => getActiveTimelineItem(timeline, currentFrame),
    [currentFrame, timeline],
  );
  const inputProps = useMemo(() => createPreviewProps(draft), [draft]);
  const maximumPlayerWidth = getResponsivePlayerMaxWidth(
    draft.composition.width,
    draft.composition.height,
  );
  const seekPlayer = useCallback(
    (frame: number, sceneId?: string) => {
      const targetFrame = clampPlayerFrame(frame, durationInFrames);
      playerRef.current?.seekTo(targetFrame);
      setCurrentFrame(targetFrame);

      if (sceneId !== undefined) {
        updateEditor((current) => selectScene(current, sceneId));
      }
    },
    [durationInFrames, updateEditor],
  );
  const seekAdjacentScene = useCallback(
    (direction: SceneSeekDirection) => {
      const targetFrame = getAdjacentSceneStartFrame(timeline, currentFrame, direction);
      const targetScene = getActiveTimelineItem(timeline, targetFrame);
      seekPlayer(targetFrame, targetScene?.sceneId);
    },
    [currentFrame, seekPlayer, timeline],
  );
  const toggleMute = useCallback(() => {
    const player = playerRef.current;

    if (player === null) {
      return;
    }

    if (player.isMuted()) {
      player.unmute();
    } else {
      player.mute();
    }
  }, []);
  const togglePlay = useCallback(() => {
    const player = playerRef.current;

    if (player === null) {
      return;
    }

    if (player.isPlaying()) {
      player.pause();
    } else {
      player.play();
    }
  }, []);

  useEffect(() => {
    const player = playerRef.current;

    if (player === null) {
      return;
    }

    const updateFrame = (event: { detail: { frame: number } }) => {
      setCurrentFrame(clampPlayerFrame(event.detail.frame, durationInFrames));
    };
    const updateMute = (event: { detail: { isMuted: boolean } }) => {
      setIsMuted(event.detail.isMuted);
    };
    const markPlaying = () => {
      setIsPlaying(true);
    };
    const markPaused = () => {
      setIsPlaying(false);
    };

    player.addEventListener('frameupdate', updateFrame);
    player.addEventListener('seeked', updateFrame);
    player.addEventListener('mutechange', updateMute);
    player.addEventListener('play', markPlaying);
    player.addEventListener('pause', markPaused);
    player.addEventListener('ended', markPaused);

    return () => {
      player.removeEventListener('frameupdate', updateFrame);
      player.removeEventListener('seeked', updateFrame);
      player.removeEventListener('mutechange', updateMute);
      player.removeEventListener('play', markPlaying);
      player.removeEventListener('pause', markPaused);
      player.removeEventListener('ended', markPaused);
    };
  }, [durationInFrames]);

  useEffect(() => {
    const clampedFrame = clampPlayerFrame(currentFrame, durationInFrames);

    if (clampedFrame !== currentFrame) {
      playerRef.current?.seekTo(clampedFrame);
      setCurrentFrame(clampedFrame);
    }
  }, [currentFrame, durationInFrames]);

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
                Bản nháp v{autosave.draftVersion} · Xem trước trực tiếp
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
              updateEditor((current) => addScene(current, crypto.randomUUID()));
            }}
            onDelete={() => {
              updateEditor(deleteSelectedScene);
            }}
            onDuplicate={() => {
              updateEditor((current) => duplicateSelectedScene(current, crypto.randomUUID()));
            }}
            onMoveDown={() => {
              updateEditor((current) => moveSelectedScene(current, 'down'));
            }}
            onMoveUp={() => {
              updateEditor((current) => moveSelectedScene(current, 'up'));
            }}
            onSelect={(sceneId) => {
              updateEditor((current) => selectScene(current, sceneId));
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
                ref={playerRef}
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
                initialFrame={initialPlayerFrame}
                inputProps={inputProps}
                initiallyMuted={draft.export.muted}
                showVolumeControls
                spaceKeyToPlayOrPause
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </div>

          <SceneStripControls
            activeSceneId={activeTimelineItem?.sceneId ?? null}
            currentFrame={currentFrame}
            fps={draft.composition.fps}
            isMuted={isMuted}
            isPlaying={isPlaying}
            timeline={timeline}
            totalFrames={durationInFrames}
            onSeek={seekPlayer}
            onSeekNext={() => {
              seekAdjacentScene('next');
            }}
            onSeekPrevious={() => {
              seekAdjacentScene('previous');
            }}
            onToggleMute={toggleMute}
            onTogglePlay={togglePlay}
          />

          <CaptionEditor
            projectId={project.id}
            captions={draft.captions}
            autosave={autosave}
            projectArchived={project.status === 'ARCHIVED'}
            onChange={(captions) => {
              updateEditor((current) => ({
                ...current,
                document: {
                  ...current.document,
                  captions,
                },
              }));
            }}
          />

          <VoiceoverEditor
            fps={draft.composition.fps}
            projectArchived={project.status === 'ARCHIVED'}
            voiceover={draft.audio.voiceover}
            onChange={(voiceover) => {
              updateEditor((current) => ({
                ...current,
                document: setProjectVoiceover(current.document, voiceover),
              }));
            }}
          />

          <BackgroundMusicEditor
            backgroundMusic={draft.audio.backgroundMusic}
            durationInFrames={durationInFrames}
            fps={draft.composition.fps}
            projectArchived={project.status === 'ARCHIVED'}
            onChange={(backgroundMusic) => {
              updateEditor((current) => ({
                ...current,
                document: setProjectBackgroundMusic(current.document, backgroundMusic),
              }));
            }}
          />
        </section>

        <aside className="min-w-0">
          <SceneInspector
            key={editorState.selectedSceneId}
            state={editorState}
            onChange={(state) => {
              updateEditor(() => state);
            }}
          />

          <AutosaveStatus autosave={autosave} />

          <RenderQueue
            projectId={project.id}
            initialPreset={draft.export.preset}
            autosavePhase={autosave.phase}
            projectArchived={project.status === 'ARCHIVED'}
          />
        </aside>
      </div>
    </main>
  );
}

export function ProjectEditor({
  projectId,
  autoSaveDelayMs = 800,
}: {
  projectId: string;
  autoSaveDelayMs?: number;
}) {
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
      autoSaveDelayMs={autoSaveDelayMs}
    />
  );
}
