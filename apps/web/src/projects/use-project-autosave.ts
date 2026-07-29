'use client';

import { type ProjectDocumentV1 } from '@hansys/project-schema';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createAutosaveState, reduceAutosaveState, type AutosavePhase } from './autosave-state.js';
import { fetchProject, ProjectApiError, saveProjectDraft, type ProjectDto } from './client.js';

type ConflictData =
  | {
      phase: 'idle' | 'loading';
      project: null;
      message: null;
    }
  | {
      phase: 'ready';
      project: ProjectDto;
      message: null;
    }
  | {
      phase: 'error';
      project: null;
      message: string;
    };

export type ProjectAutosave = {
  phase: AutosavePhase;
  draftVersion: number;
  message: string | null;
  conflict: ConflictData;
  retry: () => void;
  reloadConflict: () => void;
  keepLocal: () => void;
  useRemote: () => void;
};

type UseProjectAutosaveOptions = {
  projectId: string;
  initialDraftVersion: number;
  document: ProjectDocumentV1;
  changeSequence: number;
  delayMs: number;
  onUseRemote: (project: ProjectDto) => void;
};

function formatProjectError(error: unknown): string {
  if (error instanceof ProjectApiError) {
    return [error.message, ...error.details].join(' ');
  }

  return error instanceof Error ? error.message : 'Không thể lưu bản nháp.';
}

function isVersionConflict(error: unknown): error is ProjectApiError {
  return (
    error instanceof ProjectApiError &&
    error.status === 409 &&
    error.code === 'PROJECT_VERSION_CONFLICT'
  );
}

const idleConflict: ConflictData = {
  phase: 'idle',
  project: null,
  message: null,
};

export function useProjectAutosave({
  projectId,
  initialDraftVersion,
  document,
  changeSequence,
  delayMs,
  onUseRemote,
}: UseProjectAutosaveOptions): ProjectAutosave {
  const [state, dispatch] = useReducer(
    reduceAutosaveState,
    initialDraftVersion,
    createAutosaveState,
  );
  const [conflict, setConflict] = useState<ConflictData>(idleConflict);
  const documentRef = useRef(document);
  const savingDocumentRef = useRef<ProjectDocumentV1 | null>(null);
  const activeSaveKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  documentRef.current = document;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    dispatch({
      type: 'observe-change',
      changeSequence,
    });
  }, [changeSequence]);

  useEffect(() => {
    if (state.phase !== 'dirty') {
      return;
    }

    const timeout = window.setTimeout(() => {
      savingDocumentRef.current = documentRef.current;
      dispatch({ type: 'begin' });
    }, delayMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [delayMs, state.changeSequence, state.phase]);

  const loadLatestProject = useCallback(() => {
    setConflict({
      phase: 'loading',
      project: null,
      message: null,
    });

    void fetchProject(projectId)
      .then((project) => {
        if (!mountedRef.current) {
          return;
        }

        setConflict({
          phase: 'ready',
          project,
          message: null,
        });
      })
      .catch((error: unknown) => {
        if (!mountedRef.current) {
          return;
        }

        setConflict({
          phase: 'error',
          project: null,
          message: formatProjectError(error),
        });
      });
  }, [projectId]);

  useEffect(() => {
    if (state.phase !== 'saving' || state.savingSequence === null) {
      return;
    }

    const savingSequence = state.savingSequence;
    const saveKey = `${state.draftVersion}:${savingSequence}`;

    if (activeSaveKeyRef.current === saveKey) {
      return;
    }

    activeSaveKeyRef.current = saveKey;
    const savingDocument = savingDocumentRef.current ?? documentRef.current;

    void saveProjectDraft(projectId, state.draftVersion, savingDocument)
      .then((project) => {
        if (!mountedRef.current) {
          return;
        }

        dispatch({
          type: 'saved',
          savingSequence,
          draftVersion: project.draftVersion,
        });
      })
      .catch((error: unknown) => {
        if (!mountedRef.current) {
          return;
        }

        if (isVersionConflict(error)) {
          dispatch({
            type: 'conflict',
            savingSequence,
            message: formatProjectError(error),
          });
          loadLatestProject();
          return;
        }

        dispatch({
          type: 'failed',
          savingSequence,
          message: formatProjectError(error),
        });
      })
      .finally(() => {
        if (activeSaveKeyRef.current === saveKey) {
          activeSaveKeyRef.current = null;
        }
      });
  }, [loadLatestProject, projectId, state.draftVersion, state.phase, state.savingSequence]);

  const keepLocal = useCallback(() => {
    if (conflict.phase !== 'ready') {
      return;
    }

    dispatch({
      type: 'keep-local',
      remoteDraftVersion: conflict.project.draftVersion,
    });
    setConflict(idleConflict);
  }, [conflict]);

  const useRemote = useCallback(() => {
    if (conflict.phase !== 'ready') {
      return;
    }

    onUseRemote(conflict.project);
    dispatch({
      type: 'use-remote',
      remoteDraftVersion: conflict.project.draftVersion,
    });
    setConflict(idleConflict);
  }, [conflict, onUseRemote]);

  const retry = useCallback(() => {
    dispatch({ type: 'retry' });
  }, []);

  return {
    phase: state.phase,
    draftVersion: state.draftVersion,
    message: state.message,
    conflict,
    retry,
    reloadConflict: loadLatestProject,
    keepLocal,
    useRemote,
  };
}
