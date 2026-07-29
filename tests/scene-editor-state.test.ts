import { describe, expect, it } from 'vitest';
import { PROJECT_SCENE_TYPES } from '../packages/project-schema/src/index.js';
import {
  addScene,
  createSceneEditorState,
  deleteSelectedScene,
  duplicateSelectedScene,
  getSelectedScene,
  moveSelectedScene,
  selectScene,
  updateSelectedScene,
} from '../apps/web/src/projects/editor-state.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';

const addedSceneId = '66666666-6666-4666-8666-666666666666';
const duplicateSceneId = '77777777-7777-4777-8777-777777777777';

describe('project scene editor state', () => {
  it('selects a scene without changing document order', () => {
    const state = createSceneEditorState(structuredClone(STUDIO_PROJECT_FIXTURE));
    const secondScene = state.document.scenes[1]!;
    const selected = selectScene(state, secondScene.id);

    expect(selected.selectedSceneId).toBe(secondScene.id);
    expect(selected.document).toBe(state.document);
    expect(selected.document.scenes.map(({ id }) => id)).toEqual(
      state.document.scenes.map(({ id }) => id),
    );
  });

  it('adds a default scene after the selection and assigns only the new ID', () => {
    const state = createSceneEditorState(structuredClone(STUDIO_PROJECT_FIXTURE));
    const originalIds = state.document.scenes.map(({ id }) => id);
    const added = addScene(state, addedSceneId);

    expect(added.document.scenes.map(({ id }) => id)).toEqual([
      originalIds[0],
      addedSceneId,
      originalIds[1],
    ]);
    expect(added.selectedSceneId).toBe(addedSceneId);
    expect(getSelectedScene(added)).toMatchObject({
      id: addedSceneId,
      name: 'Scene 3',
      type: 'content',
      enabled: true,
      durationInFrames: 150,
    });
  });

  it('duplicates content deeply with a new ID and preserves every existing ID', () => {
    const state = createSceneEditorState(structuredClone(STUDIO_PROJECT_FIXTURE));
    const originalScene = getSelectedScene(state);
    const originalIds = state.document.scenes.map(({ id }) => id);
    const duplicated = duplicateSelectedScene(state, duplicateSceneId);
    const copy = getSelectedScene(duplicated);

    expect(duplicated.document.scenes.map(({ id }) => id)).toEqual([
      originalIds[0],
      duplicateSceneId,
      originalIds[1],
    ]);
    expect(copy.id).toBe(duplicateSceneId);
    expect(copy.name).toBe(`${originalScene.name} (bản sao)`);
    expect(copy.text).toEqual(originalScene.text);
    expect(copy.text).not.toBe(originalScene.text);
  });

  it('reorders scene objects while all IDs and the selected ID remain stable', () => {
    const initial = createSceneEditorState(structuredClone(STUDIO_PROJECT_FIXTURE));
    const originalIds = initial.document.scenes.map(({ id }) => id);
    const selected = selectScene(initial, originalIds[1]!);
    const movedUp = moveSelectedScene(selected, 'up');
    const movedBackDown = moveSelectedScene(movedUp, 'down');

    expect(movedUp.document.scenes.map(({ id }) => id)).toEqual([originalIds[1], originalIds[0]]);
    expect(movedUp.selectedSceneId).toBe(originalIds[1]);
    expect(movedBackDown.document.scenes.map(({ id }) => id)).toEqual(originalIds);
    expect(movedBackDown.selectedSceneId).toBe(originalIds[1]);
  });

  it('selects the next scene after delete and never leaves the project empty or disabled', () => {
    const state = createSceneEditorState(structuredClone(STUDIO_PROJECT_FIXTURE));
    state.document.scenes[1]!.enabled = false;
    const remainingSceneId = state.document.scenes[1]!.id;
    const deleted = deleteSelectedScene(state);
    const unchanged = deleteSelectedScene(deleted);

    expect(deleted.document.scenes).toHaveLength(1);
    expect(deleted.selectedSceneId).toBe(remainingSceneId);
    expect(deleted.document.scenes[0]).toMatchObject({
      id: remainingSceneId,
      enabled: true,
    });
    expect(unchanged).toBe(deleted);
  });

  it('ignores duplicate generated IDs', () => {
    const state = createSceneEditorState(structuredClone(STUDIO_PROJECT_FIXTURE));

    expect(addScene(state, state.document.scenes[1]!.id)).toBe(state);
    expect(duplicateSelectedScene(state, state.document.scenes[1]!.id)).toBe(state);
  });

  it.each(PROJECT_SCENE_TYPES)('edits the MVP "%s" scene type', (type) => {
    const state = createSceneEditorState(structuredClone(STUDIO_PROJECT_FIXTURE));
    const result = updateSelectedScene(state, (scene) => ({
      ...scene,
      type,
      name: `Scene ${type}`,
      durationInFrames: 180,
      text: {
        label: 'Tin mới',
        headline: `Tiêu đề ${type}`,
        body: 'Nội dung đã chỉnh sửa',
        source: 'HanSYS',
        ...(type === 'bullet-list' ? { bullets: ['Ý thứ nhất', 'Ý thứ hai'] } : {}),
        ...(type === 'quote' ? { quoteAuthor: 'Tác giả' } : {}),
      },
      ...(type === 'image' || type === 'video'
        ? {
            media: {
              assetId: '88888888-8888-4888-8888-888888888888',
              fit: 'contain' as const,
              positionX: 0.25,
              positionY: 0.75,
              scale: 1.2,
              startFromMs: 500,
              playbackRate: 1.25,
              muted: false,
            },
          }
        : {}),
      style: {
        variant: 'compact',
        textAlign: 'right',
        emphasis: 'urgent',
      },
    }));

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(getSelectedScene(result.state)).toMatchObject({
      type,
      name: `Scene ${type}`,
      durationInFrames: 180,
      text: {
        headline: `Tiêu đề ${type}`,
      },
      style: {
        variant: 'compact',
        textAlign: 'right',
        emphasis: 'urgent',
      },
    });
  });

  it('rejects invalid fields before replacing editor state', () => {
    const state = createSceneEditorState(structuredClone(STUDIO_PROJECT_FIXTURE));
    const invalidDuration = updateSelectedScene(state, (scene) => ({
      ...scene,
      durationInFrames: 5,
    }));
    const invalidHeadline = updateSelectedScene(state, (scene) => ({
      ...scene,
      text: {
        ...scene.text,
        headline: 'x'.repeat(301),
      },
    }));
    const invalidMediaPosition = updateSelectedScene(state, (scene) => ({
      ...scene,
      type: 'image',
      media: {
        assetId: '88888888-8888-4888-8888-888888888888',
        fit: 'cover',
        positionX: 1.1,
        positionY: 0.5,
        scale: 1,
        startFromMs: 0,
        playbackRate: 1,
        muted: true,
      },
    }));

    expect(invalidDuration).toMatchObject({ success: false });
    expect(invalidHeadline).toMatchObject({ success: false });
    expect(invalidMediaPosition).toMatchObject({ success: false });
    expect(state.document).toEqual(STUDIO_PROJECT_FIXTURE);
  });

  it('rejects an edit that pushes the enabled project past 180 seconds', () => {
    const state = createSceneEditorState(structuredClone(STUDIO_PROJECT_FIXTURE));
    const result = updateSelectedScene(state, (scene) => ({
      ...scene,
      durationInFrames: 5_290,
    }));

    expect(result).toMatchObject({
      success: false,
      error: {
        message: expect.stringContaining('180'),
      },
    });
    expect(getSelectedScene(state).durationInFrames).toBe(90);
  });
});
