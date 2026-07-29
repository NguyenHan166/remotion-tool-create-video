import { describe, expect, it } from 'vitest';
import {
  NEWS_CLEAN_V1_SCENE_TYPES,
  getTemplate,
  listTemplateMetadata,
  newsCleanV1,
  validateNewsCleanV1,
} from '../packages/template-registry/src/index.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';
import { ProjectVideo } from '../packages/video/src/project-video.js';

describe('news-clean-v1 manifest', () => {
  it('is registered with all project scene types and local editorial defaults', () => {
    expect(getTemplate('news-clean-v1', 1)).toBe(newsCleanV1);
    expect(NEWS_CLEAN_V1_SCENE_TYPES).toEqual([
      'hook',
      'headline',
      'content',
      'image',
      'video',
      'bullet-list',
      'quote',
      'outro',
    ]);
    expect(listTemplateMetadata()).toEqual([
      expect.objectContaining({
        id: 'news-clean-v1',
        version: 1,
        supportedAspectRatios: ['9:16', '16:9', '1:1'],
        defaultProjectPatch: expect.objectContaining({
          theme: expect.objectContaining({
            fontFamily: 'BeVietnamPro',
          }),
        }),
      }),
    ]);
  });

  it('validates the Vietnamese Studio fixture without errors', () => {
    const validation = validateNewsCleanV1(STUDIO_PROJECT_FIXTURE);

    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);
  });

  it('reports media errors and editorial readability warnings with field paths', () => {
    const project = structuredClone(STUDIO_PROJECT_FIXTURE);
    project.scenes = [
      {
        ...project.scenes[0]!,
        type: 'image',
        text: {
          headline: 'Một tiêu đề rất dài '.repeat(10).trim(),
          bullets: Array.from({ length: 7 }, (_, index) => `Ý chính ${index + 1}`),
        },
      },
    ];

    const validation = validateNewsCleanV1(project);

    expect(validation.errors).toContainEqual({
      code: 'MEDIA_REQUIRED',
      path: 'scenes.0.media',
      message: 'Image scenes require a media asset.',
    });
    expect(validation.warnings.map(({ code }) => code)).toEqual([
      'LONG_HEADLINE',
      'MANY_BULLETS',
      'SOURCE_RECOMMENDED',
    ]);
  });

  it('routes ProjectVideo through the registered runtime component', () => {
    const element = ProjectVideo({
      project: STUDIO_PROJECT_FIXTURE,
      assets: {},
    });

    expect(element.type).toBe(newsCleanV1.Component);
    expect(element.props).toMatchObject({
      assets: {},
      project: STUDIO_PROJECT_FIXTURE,
    });
  });
});
