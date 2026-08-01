import { describe, expect, it } from 'vitest';
import {
  WARNING_DARK_V1_SCENE_TYPES,
  getTemplate,
  listTemplateMetadata,
  validateWarningDarkV1,
  warningDarkV1,
} from '../packages/template-registry/src/index.js';
import {
  WARNING_DARK_PROJECT_FIXTURE,
  WARNING_DARK_VIDEO_PROPS,
} from '../packages/video/src/fixture.js';
import { ProjectVideo } from '../packages/video/src/project-video.js';
import { getWarningHeadlineFontSize } from '../packages/video/src/templates/warning-dark-v1/index.js';
import { WARNING_DARK_SAFE_AREA } from '../packages/video/src/templates/warning-dark-v1/tokens.js';

describe('warning-dark-v1 template', () => {
  it('is registered with alert variants and all project scene types', () => {
    expect(getTemplate('warning-dark-v1', 1)).toBe(warningDarkV1);
    expect(WARNING_DARK_V1_SCENE_TYPES).toEqual([
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
          id: 'warning-dark-v1',
          version: 1,
          variants: [
            { id: 'default', name: 'Alert' },
            { id: 'cyber', name: 'Cyber Safety' },
            { id: 'scam', name: 'Scam Warning' },
          ],
          defaultProjectPatch: expect.objectContaining({
            composition: expect.objectContaining({ backgroundColor: '#090A0F' }),
            theme: expect.objectContaining({
              primaryColor: '#F04438',
              accentColor: '#F7C948',
            }),
          }),
        }),
      ]),
    );
  });

  it('validates the warning fixture without errors', () => {
    const validation = validateWarningDarkV1(WARNING_DARK_PROJECT_FIXTURE);

    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);
  });

  it('keeps warning headlines adaptive and captions below the content safe area', () => {
    expect({
      short: getWarningHeadlineFontSize(32, 1080, 1920),
      long: getWarningHeadlineFontSize(220, 1080, 1920),
      veryLong: getWarningHeadlineFontSize(300, 1080, 1920),
      safeArea: WARNING_DARK_SAFE_AREA,
    }).toMatchInlineSnapshot(`
      {
        "long": 55,
        "safeArea": {
          "bottom": "7%",
          "captionBottom": "16%",
          "horizontal": "6%",
          "top": "6%",
        },
        "short": 96,
        "veryLong": 47,
      }
    `);
  });

  it('routes ProjectVideo through the registered warning renderer', () => {
    const element = ProjectVideo(WARNING_DARK_VIDEO_PROPS);

    expect(element.type).toBe(warningDarkV1.Component);
    expect(element.props).toMatchObject({
      assets: {},
      project: WARNING_DARK_PROJECT_FIXTURE,
    });
  });
});
