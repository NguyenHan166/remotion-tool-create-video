import { type ProjectDocumentV1 } from '@hansys/project-schema';

export type SceneTimelineItem = {
  sceneId: string;
  name: string;
  type: ProjectDocumentV1['scenes'][number]['type'];
  durationInFrames: number;
  startFrame: number;
  endFrame: number;
};

export type SceneSeekDirection = 'previous' | 'next';

export function createSceneTimeline(document: ProjectDocumentV1): SceneTimelineItem[] {
  let startFrame = 0;

  return document.scenes
    .filter((scene) => scene.enabled)
    .map((scene) => {
      const item: SceneTimelineItem = {
        sceneId: scene.id,
        name: scene.name,
        type: scene.type,
        durationInFrames: scene.durationInFrames,
        startFrame,
        endFrame: startFrame + scene.durationInFrames,
      };
      startFrame = item.endFrame;

      return item;
    });
}

export function getTimelineDuration(timeline: readonly SceneTimelineItem[]): number {
  return timeline.at(-1)?.endFrame ?? 0;
}

export function clampPlayerFrame(frame: number, totalFrames: number): number {
  if (totalFrames <= 1) {
    return 0;
  }

  return Math.min(totalFrames - 1, Math.max(0, Math.round(frame)));
}

export function getActiveTimelineItem(
  timeline: readonly SceneTimelineItem[],
  frame: number,
): SceneTimelineItem | null {
  if (timeline.length === 0) {
    return null;
  }

  const clampedFrame = clampPlayerFrame(frame, getTimelineDuration(timeline));

  return (
    timeline.find((item) => clampedFrame >= item.startFrame && clampedFrame < item.endFrame) ??
    timeline.at(-1)!
  );
}

export function getSceneStartFrame(
  timeline: readonly SceneTimelineItem[],
  sceneId: string,
): number | null {
  return timeline.find((item) => item.sceneId === sceneId)?.startFrame ?? null;
}

export function getAdjacentSceneStartFrame(
  timeline: readonly SceneTimelineItem[],
  frame: number,
  direction: SceneSeekDirection,
): number {
  const activeItem = getActiveTimelineItem(timeline, frame);

  if (activeItem === null) {
    return 0;
  }

  const activeIndex = timeline.findIndex((item) => item.sceneId === activeItem.sceneId);
  const targetIndex =
    direction === 'previous'
      ? Math.max(0, activeIndex - 1)
      : Math.min(timeline.length - 1, activeIndex + 1);

  return timeline[targetIndex]?.startFrame ?? activeItem.startFrame;
}

export function formatPlayerTime(frame: number, fps: number): string {
  const milliseconds = Math.max(0, Math.round((frame / fps) * 1_000));
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    remainder,
  ).padStart(3, '0')}`;
}
