import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAutosaveState,
  reduceAutosaveState,
} from '../apps/web/src/projects/autosave-state.js';
import {
  ProjectApiError,
  importSrtCaptions,
  saveProjectDraft,
  updateProjectCaptions,
} from '../apps/web/src/projects/client.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';

const projectId = '55555555-5555-4555-8555-555555555555';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('project autosave state', () => {
  it('settles after one successful save without starting a save loop', () => {
    const initial = createAutosaveState(1);
    const dirty = reduceAutosaveState(initial, {
      type: 'observe-change',
      changeSequence: 1,
    });
    const saving = reduceAutosaveState(dirty, { type: 'begin' });
    const saved = reduceAutosaveState(saving, {
      type: 'saved',
      savingSequence: 1,
      draftVersion: 2,
    });

    expect(saving).toMatchObject({
      phase: 'saving',
      savingSequence: 1,
    });
    expect(saved).toMatchObject({
      phase: 'saved',
      draftVersion: 2,
      savedSequence: 1,
      savingSequence: null,
    });
    expect(reduceAutosaveState(saved, { type: 'begin' })).toBe(saved);
  });

  it('queues an edit made during a request and saves it with the returned version', () => {
    const dirty = reduceAutosaveState(createAutosaveState(4), {
      type: 'observe-change',
      changeSequence: 1,
    });
    const saving = reduceAutosaveState(dirty, { type: 'begin' });
    const editedWhileSaving = reduceAutosaveState(saving, {
      type: 'observe-change',
      changeSequence: 2,
    });
    const firstSaved = reduceAutosaveState(editedWhileSaving, {
      type: 'saved',
      savingSequence: 1,
      draftVersion: 5,
    });
    const secondSaving = reduceAutosaveState(firstSaved, { type: 'begin' });

    expect(editedWhileSaving.phase).toBe('saving');
    expect(firstSaved).toMatchObject({
      phase: 'dirty',
      draftVersion: 5,
      savedSequence: 1,
      changeSequence: 2,
    });
    expect(secondSaving).toMatchObject({
      phase: 'saving',
      draftVersion: 5,
      savingSequence: 2,
    });
  });

  it('blocks automatic saves on conflict until the user chooses a recovery', () => {
    const dirty = reduceAutosaveState(createAutosaveState(1), {
      type: 'observe-change',
      changeSequence: 1,
    });
    const saving = reduceAutosaveState(dirty, { type: 'begin' });
    const conflict = reduceAutosaveState(saving, {
      type: 'conflict',
      savingSequence: 1,
      message: 'Version conflict',
    });
    const editedInConflict = reduceAutosaveState(conflict, {
      type: 'observe-change',
      changeSequence: 2,
    });

    expect(conflict.phase).toBe('conflict');
    expect(reduceAutosaveState(conflict, { type: 'begin' })).toBe(conflict);
    expect(editedInConflict).toMatchObject({
      phase: 'conflict',
      changeSequence: 2,
    });

    const keepLocal = reduceAutosaveState(editedInConflict, {
      type: 'keep-local',
      remoteDraftVersion: 3,
    });
    expect(keepLocal).toMatchObject({
      phase: 'dirty',
      draftVersion: 3,
    });

    const useRemote = reduceAutosaveState(conflict, {
      type: 'use-remote',
      remoteDraftVersion: 3,
    });
    expect(useRemote).toMatchObject({
      phase: 'saved',
      draftVersion: 3,
      savedSequence: 1,
    });
    expect(reduceAutosaveState(useRemote, { type: 'begin' })).toBe(useRemote);
  });

  it('exposes an error and only retries after an explicit action', () => {
    const dirty = reduceAutosaveState(createAutosaveState(2), {
      type: 'observe-change',
      changeSequence: 1,
    });
    const saving = reduceAutosaveState(dirty, { type: 'begin' });
    const failed = reduceAutosaveState(saving, {
      type: 'failed',
      savingSequence: 1,
      message: 'Network unavailable',
    });

    expect(failed).toMatchObject({
      phase: 'error',
      message: 'Network unavailable',
    });
    expect(reduceAutosaveState(failed, { type: 'begin' })).toBe(failed);
    expect(reduceAutosaveState(failed, { type: 'retry' })).toMatchObject({
      phase: 'dirty',
      message: null,
    });
  });

  it('accepts a server-side caption import as the new saved draft version', () => {
    const dirty = reduceAutosaveState(createAutosaveState(3), {
      type: 'observe-change',
      changeSequence: 1,
    });
    const accepted = reduceAutosaveState(dirty, {
      type: 'accept-server',
      remoteDraftVersion: 4,
    });

    expect(accepted).toMatchObject({
      phase: 'saved',
      draftVersion: 4,
      changeSequence: 1,
      savedSequence: 1,
      savingSequence: null,
    });
  });

  it('enters conflict recovery when a specialized optimistic update is stale', () => {
    const state = createAutosaveState(3);
    const conflict = reduceAutosaveState(state, {
      type: 'external-conflict',
      message: 'Expected version 3; current version is 4.',
    });

    expect(conflict).toMatchObject({
      phase: 'conflict',
      draftVersion: 3,
      savingSequence: null,
      message: 'Expected version 3; current version is 4.',
    });
  });
});

describe('project autosave client', () => {
  it('PATCHes the full document with the expected draft version', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, request?: RequestInit) => {
      void input;
      void request;

      return Response.json({
        id: projectId,
        name: 'Autosave project',
        description: null,
        status: 'DRAFT',
        draftVersion: 8,
        document: STUDIO_PROJECT_FIXTURE,
        createdAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:01.000Z',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveProjectDraft(projectId, 7, STUDIO_PROJECT_FIXTURE)).resolves.toMatchObject({
      draftVersion: 8,
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/v1/projects/${projectId}`);
    expect(request).toBeDefined();
    expect(request).toMatchObject({
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    expect(JSON.parse(request?.body as string)).toEqual({
      expectedDraftVersion: 7,
      document: STUDIO_PROJECT_FIXTURE,
    });
  });

  it('preserves the 409 conflict code for the recovery flow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: 'PROJECT_VERSION_CONFLICT',
              message: 'Project draft version conflict.',
              details: [
                {
                  path: 'expectedDraftVersion',
                  message: 'Expected version 1; current version is 2.',
                },
              ],
            },
          },
          { status: 409 },
        ),
      ),
    );

    const error = await saveProjectDraft(projectId, 1, STUDIO_PROJECT_FIXTURE).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ProjectApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'PROJECT_VERSION_CONFLICT',
      details: ['Expected version 1; current version is 2.'],
    });
  });

  it('imports an SRT file with the optimistic draft version', async () => {
    const responseBody = {
      project: {
        id: projectId,
        name: 'Caption project',
        description: null,
        status: 'DRAFT',
        draftVersion: 8,
        document: STUDIO_PROJECT_FIXTURE,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:01.000Z',
      },
      warnings: [],
    };
    const fetchMock = vi.fn(async (input: string | URL | Request, request?: RequestInit) => {
      void input;
      void request;
      return Response.json(responseBody);
    });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['1\n00:00:00,000 --> 00:00:01,000\nXin chào'], 'vi.srt');

    await expect(importSrtCaptions(projectId, 7, file)).resolves.toEqual(responseBody);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/v1/projects/${projectId}/captions/import-srt`);
    expect(request).toMatchObject({ method: 'POST' });
    expect(request?.body).toBeInstanceOf(FormData);
    expect((request?.body as FormData).get('file')).toBe(file);
    expect((request?.body as FormData).get('expectedDraftVersion')).toBe('7');
  });

  it('PUTs only caption configuration with optimistic concurrency', async () => {
    const project = {
      id: projectId,
      name: 'Caption project',
      description: null,
      status: 'DRAFT',
      draftVersion: 9,
      document: STUDIO_PROJECT_FIXTURE,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:01.000Z',
    };
    const fetchMock = vi.fn(async () => Response.json(project));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateProjectCaptions(projectId, 8, STUDIO_PROJECT_FIXTURE.captions),
    ).resolves.toEqual(project);
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/projects/${projectId}/captions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedDraftVersion: 8,
        captions: STUDIO_PROJECT_FIXTURE.captions,
      }),
    });
  });
});
