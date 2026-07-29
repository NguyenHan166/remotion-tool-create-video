import {
  PROJECT_DOCUMENT_DEFAULTS,
  ProjectDocumentSchema,
  SceneV1Schema,
  type ProjectDocumentV1,
  type SceneV1,
} from '@hansys/project-schema';

export type SceneEditorState = {
  document: ProjectDocumentV1;
  selectedSceneId: string;
};

export type SceneMoveDirection = 'up' | 'down';
export type SceneUpdateResult =
  | {
      success: true;
      state: SceneEditorState;
    }
  | {
      success: false;
      error: {
        path: string;
        message: string;
      };
    };

export type SceneUpdater = (scene: SceneV1) => SceneV1;

const MAX_SCENES = 100;

function getSceneIndex(state: SceneEditorState): number {
  return state.document.scenes.findIndex((scene) => scene.id === state.selectedSceneId);
}

export function createSceneEditorState(document: ProjectDocumentV1): SceneEditorState {
  const selectedScene = document.scenes.find((scene) => scene.enabled) ?? document.scenes[0];

  if (selectedScene === undefined) {
    throw new Error('Project does not contain a scene.');
  }

  return {
    document,
    selectedSceneId: selectedScene.id,
  };
}

export function getSelectedScene(state: SceneEditorState): SceneV1 {
  const scene = state.document.scenes.find((candidate) => candidate.id === state.selectedSceneId);

  if (scene === undefined) {
    throw new Error(`Selected scene "${state.selectedSceneId}" does not exist.`);
  }

  return scene;
}

export function selectScene(state: SceneEditorState, sceneId: string): SceneEditorState {
  if (!state.document.scenes.some((scene) => scene.id === sceneId)) {
    return state;
  }

  return {
    ...state,
    selectedSceneId: sceneId,
  };
}

function insertSceneAfterSelection(state: SceneEditorState, scene: SceneV1): SceneEditorState {
  if (
    state.document.scenes.length >= MAX_SCENES ||
    state.document.scenes.some((candidate) => candidate.id === scene.id)
  ) {
    return state;
  }

  const selectedIndex = getSceneIndex(state);
  const insertionIndex = selectedIndex < 0 ? state.document.scenes.length : selectedIndex + 1;
  const scenes = [...state.document.scenes];
  scenes.splice(insertionIndex, 0, scene);

  return {
    document: {
      ...state.document,
      scenes,
    },
    selectedSceneId: scene.id,
  };
}

export function addScene(state: SceneEditorState, sceneId: string): SceneEditorState {
  const scene: SceneV1 = {
    id: sceneId,
    type: 'content',
    name: `Scene ${state.document.scenes.length + 1}`,
    enabled: PROJECT_DOCUMENT_DEFAULTS.scene.enabled,
    durationInFrames: PROJECT_DOCUMENT_DEFAULTS.scene.durationInFrames,
    text: {},
    style: { ...PROJECT_DOCUMENT_DEFAULTS.scene.style },
  };

  return insertSceneAfterSelection(state, scene);
}

function duplicateName(name: string): string {
  const suffix = ' (bản sao)';
  return `${name.slice(0, 200 - suffix.length)}${suffix}`;
}

export function duplicateSelectedScene(state: SceneEditorState, sceneId: string): SceneEditorState {
  const selectedScene = getSelectedScene(state);
  const duplicate: SceneV1 = {
    ...structuredClone(selectedScene),
    id: sceneId,
    name: duplicateName(selectedScene.name),
  };

  return insertSceneAfterSelection(state, duplicate);
}

export function deleteSelectedScene(state: SceneEditorState): SceneEditorState {
  if (state.document.scenes.length <= 1) {
    return state;
  }

  const selectedIndex = getSceneIndex(state);

  if (selectedIndex < 0) {
    return state;
  }

  let scenes = state.document.scenes.filter((scene) => scene.id !== state.selectedSceneId);
  const nextSelection = scenes[Math.min(selectedIndex, scenes.length - 1)];

  if (nextSelection === undefined) {
    return state;
  }

  if (!scenes.some((scene) => scene.enabled)) {
    scenes = scenes.map((scene) =>
      scene.id === nextSelection.id ? { ...scene, enabled: true } : scene,
    );
  }

  return {
    document: {
      ...state.document,
      scenes,
    },
    selectedSceneId: nextSelection.id,
  };
}

export function moveSelectedScene(
  state: SceneEditorState,
  direction: SceneMoveDirection,
): SceneEditorState {
  const selectedIndex = getSceneIndex(state);
  const targetIndex = direction === 'up' ? selectedIndex - 1 : selectedIndex + 1;

  if (selectedIndex < 0 || targetIndex < 0 || targetIndex >= state.document.scenes.length) {
    return state;
  }

  const scenes = [...state.document.scenes];
  [scenes[selectedIndex], scenes[targetIndex]] = [scenes[targetIndex]!, scenes[selectedIndex]!];

  return {
    ...state,
    document: {
      ...state.document,
      scenes,
    },
  };
}

export function updateSelectedScene(
  state: SceneEditorState,
  updater: SceneUpdater,
): SceneUpdateResult {
  const sceneIndex = getSceneIndex(state);
  const nextScene = updater(getSelectedScene(state));
  const sceneResult = SceneV1Schema.safeParse(nextScene);

  if (!sceneResult.success) {
    const issue = sceneResult.error.issues[0] ?? {
      path: [],
      message: 'Scene is invalid.',
    };

    return {
      success: false,
      error: {
        path: issue.path.join('.'),
        message: issue.message,
      },
    };
  }

  const nextDocument = {
    ...state.document,
    scenes: state.document.scenes.map((scene, index) =>
      index === sceneIndex ? sceneResult.data : scene,
    ),
  };

  const documentResult = ProjectDocumentSchema.safeParse(nextDocument);

  if (!documentResult.success) {
    const issue = documentResult.error.issues[0] ?? {
      path: [],
      message: 'Project document is invalid.',
    };

    return {
      success: false,
      error: {
        path: issue.path.join('.'),
        message: issue.message,
      },
    };
  }

  return {
    success: true,
    state: {
      ...state,
      document: documentResult.data,
    },
  };
}

export function updateSelectedSceneHeadline(
  state: SceneEditorState,
  headline: string,
): SceneEditorState {
  const result = updateSelectedScene(state, (scene) => ({
    ...scene,
    text: {
      ...scene.text,
      headline,
    },
  }));

  return result.success ? result.state : state;
}
