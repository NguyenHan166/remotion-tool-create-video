import { describe, expect, it } from 'vitest';
import {
  BREAKING_RED_V1_SCENE_TYPES,
  breakingRedV1,
  getTemplate,
  listTemplateMetadata,
  validateBreakingRedV1,
} from '../packages/template-registry/src/index.js';
import {
  BREAKING_RED_PROJECT_FIXTURE,
  BREAKING_RED_VIDEO_PROPS,
} from '../packages/video/src/fixture.js';
import { getBreakingHeadlineFontSize } from '../packages/video/src/templates/breaking-red-v1/index.js';
import { ProjectVideo } from '../packages/video/src/project-video.js';

describe('breaking-red-v1 template', () => {
  it('is registered with high-contrast variants and all project scene types', () => {
    expect(getTemplate('breaking-red-v1', 1)).toBe(breakingRedV1);
    expect(BREAKING_RED_V1_SCENE_TYPES).toEqual([
      'hook',
      'headline',
      'content',
      'image',
      'video',
      'bullet-list',
      'quote',
      'outro',
    ]);
    expect(listTemplateMetadata()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'breaking-red-v1',
          version: 1,
          variants: [
            { id: 'default', name: 'Breaking' },
            { id: 'urgent', name: 'Urgent Flash' },
            { id: 'compact', name: 'Compact' },
          ],
          defaultProjectPatch: expect.objectContaining({
            composition: expect.objectContaining({ backgroundColor: '#120507' }),
            theme: expect.objectContaining({
              primaryColor: '#E11D2E',
              accentColor: '#FFD166',
            }),
          }),
        }),
      ]),
    );
  });

  it('validates the Vietnamese long-headline fixture without render errors', () => {
    const validation = validateBreakingRedV1(BREAKING_RED_PROJECT_FIXTURE);

    expect(validation.errors).toEqual([]);
    expect(validation.warnings.map(({ code }) => code)).toEqual(['LONG_HEADLINE']);
    expect(BREAKING_RED_PROJECT_FIXTURE.scenes[0]?.text.headline?.length).toBeGreaterThan(140);
  });

  it('keeps long Vietnamese headlines inside an adaptive readable range', () => {
    expect({
      short: getBreakingHeadlineFontSize(32, 1080, 1920),
      long: getBreakingHeadlineFontSize(220, 1080, 1920),
      veryLong: getBreakingHeadlineFontSize(300, 1080, 1920),
    }).toMatchInlineSnapshot(`
      {
        "long": 59,
        "short": 104,
        "veryLong": 51,
      }
    `);
  });

  it('routes ProjectVideo through the registered breaking renderer', () => {
    const element = ProjectVideo(BREAKING_RED_VIDEO_PROPS);

    expect(element.type).toBe(breakingRedV1.Component);
    expect(element.props).toMatchObject({
      assets: {},
      project: BREAKING_RED_PROJECT_FIXTURE,
    });
  });
});
