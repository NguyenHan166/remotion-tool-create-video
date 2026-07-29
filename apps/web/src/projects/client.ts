import {
  extractProjectAssetIds,
  type ProjectDocumentV1,
  type SceneV1,
} from '@hansys/project-schema';
import { type ResolvedAsset, type VideoProps } from '@hansys/video';

export type ProjectDto = {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'ARCHIVED';
  draftVersion: number;
  document: ProjectDocumentV1;
  createdAt: string;
  updatedAt: string;
};

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{
      path?: string;
      message?: string;
    }>;
  };
};

export class ProjectApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];

  constructor(status: number, code: string, message: string, details: string[] = []) {
    super(message);
    this.name = 'ProjectApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function toApiError(response: Response): Promise<ProjectApiError> {
  let envelope: ErrorEnvelope = {};

  try {
    envelope = (await response.json()) as ErrorEnvelope;
  } catch {
    // Interrupted and proxy responses may not contain the standard JSON envelope.
  }

  return new ProjectApiError(
    response.status,
    envelope.error?.code ?? 'REQUEST_FAILED',
    envelope.error?.message ?? `Request failed with status ${response.status}.`,
    envelope.error?.details
      ?.map((detail) => detail.message)
      .filter((message): message is string => message !== undefined) ?? [],
  );
}

export async function fetchProject(projectId: string, signal?: AbortSignal): Promise<ProjectDto> {
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as ProjectDto;
}

export function getPreviewScene(document: ProjectDocumentV1): SceneV1 {
  const scene = document.scenes.find((candidate) => candidate.enabled);

  if (scene === undefined) {
    throw new Error('Project does not contain an enabled scene.');
  }

  return scene;
}

export function updateSceneHeadline(
  document: ProjectDocumentV1,
  sceneId: string,
  headline: string,
): ProjectDocumentV1 {
  return {
    ...document,
    scenes: document.scenes.map((scene) =>
      scene.id === sceneId
        ? {
            ...scene,
            text: {
              ...scene.text,
              headline,
            },
          }
        : scene,
    ),
  };
}

function getAssetKind(document: ProjectDocumentV1, assetId: string): ResolvedAsset['kind'] {
  if (document.theme.logoAssetId === assetId) {
    return 'LOGO';
  }

  if (
    document.audio.voiceover?.assetId === assetId ||
    document.audio.backgroundMusic?.assetId === assetId
  ) {
    return 'AUDIO';
  }

  const scene = document.scenes.find((candidate) => candidate.media?.assetId === assetId);
  return scene?.type === 'video' ? 'VIDEO' : 'IMAGE';
}

export function resolvePreviewAssets(document: ProjectDocumentV1): Record<string, ResolvedAsset> {
  return Object.fromEntries(
    extractProjectAssetIds(document).map((assetId) => [
      assetId,
      {
        id: assetId,
        kind: getAssetKind(document, assetId),
        src: `/api/v1/assets/${encodeURIComponent(assetId)}/file`,
      },
    ]),
  );
}

export function createPreviewProps(document: ProjectDocumentV1): VideoProps {
  return {
    project: document,
    assets: resolvePreviewAssets(document),
  };
}

export function getResponsivePlayerMaxWidth(
  compositionWidth: number,
  compositionHeight: number,
  maximumHeight = 840,
): number {
  return Math.max(320, Math.round(maximumHeight * (compositionWidth / compositionHeight)));
}
