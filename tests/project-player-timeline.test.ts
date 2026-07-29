import { describe, expect, it } from 'vitest';
import {
  clampPlayerFrame,
  createSceneTimeline,
  formatPlayerTime,
  getActiveTimelineItem,
  getAdjacentSceneStartFrame,
  getSceneStartFrame,
  getTimelineDuration,
} from '../apps/web/src/projects/player-timeline.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';

describe('project player timeline', () => {
  it('builds exact inclusive-start and exclusive-end scene boundaries', () => {
    const timeline = createSceneTimeline(STUDIO_PROJECT_FIXTURE);

    expect(timeline).toEqual([
      {
        sceneId: STUDIO_PROJECT_FIXTURE.scenes[0]!.id,
        name: STUDIO_PROJECT_FIXTURE.scenes[0]!.name,
        type: 'headline',
        durationInFrames: 90,
        startFrame: 0,
        endFrame: 90,
      },
      {
        sceneId: STUDIO_PROJECT_FIXTURE.scenes[1]!.id,
        name: STUDIO_PROJECT_FIXTURE.scenes[1]!.name,
        type: 'content',
        durationInFrames: 120,
        startFrame: 90,
        endFrame: 210,
      },
    ]);
    expect(getTimelineDuration(timeline)).toBe(210);
    expect(getSceneStartFrame(timeline, STUDIO_PROJECT_FIXTURE.scenes[1]!.id)).toBe(90);
  });

  it('switches the active scene on the exact boundary frame', () => {
    const timeline = createSceneTimeline(STUDIO_PROJECT_FIXTURE);

    expect(getActiveTimelineItem(timeline, 0)?.sceneId).toBe(STUDIO_PROJECT_FIXTURE.scenes[0]!.id);
    expect(getActiveTimelineItem(timeline, 89)?.sceneId).toBe(STUDIO_PROJECT_FIXTURE.scenes[0]!.id);
    expect(getActiveTimelineItem(timeline, 90)?.sceneId).toBe(STUDIO_PROJECT_FIXTURE.scenes[1]!.id);
    expect(getActiveTimelineItem(timeline, 209)?.sceneId).toBe(
      STUDIO_PROJECT_FIXTURE.scenes[1]!.id,
    );
    expect(getActiveTimelineItem(timeline, 210)?.sceneId).toBe(
      STUDIO_PROJECT_FIXTURE.scenes[1]!.id,
    );
  });

  it('seeks previous and next scenes to exact start frames and clamps outer edges', () => {
    const timeline = createSceneTimeline(STUDIO_PROJECT_FIXTURE);

    expect(getAdjacentSceneStartFrame(timeline, 89, 'next')).toBe(90);
    expect(getAdjacentSceneStartFrame(timeline, 90, 'previous')).toBe(0);
    expect(getAdjacentSceneStartFrame(timeline, 0, 'previous')).toBe(0);
    expect(getAdjacentSceneStartFrame(timeline, 209, 'next')).toBe(90);
  });

  it('excludes disabled scenes and rebases later boundaries to frame zero', () => {
    const document = structuredClone(STUDIO_PROJECT_FIXTURE);
    document.scenes[0]!.enabled = false;
    const timeline = createSceneTimeline(document);

    expect(timeline).toEqual([
      {
        sceneId: document.scenes[1]!.id,
        name: document.scenes[1]!.name,
        type: 'content',
        durationInFrames: 120,
        startFrame: 0,
        endFrame: 120,
      },
    ]);
  });

  it('clamps frame input and formats frame-derived time deterministically', () => {
    expect(clampPlayerFrame(-10, 210)).toBe(0);
    expect(clampPlayerFrame(89.6, 210)).toBe(90);
    expect(clampPlayerFrame(999, 210)).toBe(209);
    expect(formatPlayerTime(0, 30)).toBe('00:00.000');
    expect(formatPlayerTime(90, 30)).toBe('00:03.000');
    expect(formatPlayerTime(1_845, 30)).toBe('01:01.500');
  });
});
