import { type ProjectDocumentV1, type SceneV1 } from '@hansys/project-schema';
import { createRegisteredTemplateComponent } from '../renderer-registry.js';
import {
  type TemplateAspectRatio,
  type TemplateManifest,
  type TemplateValidationIssue,
} from '../types.js';

export const NEWS_CLEAN_V1_ID = 'news-clean-v1';

export const NEWS_CLEAN_V1_SCENE_TYPES = [
  'hook',
  'headline',
  'content',
  'image',
  'video',
  'bullet-list',
  'quote',
  'outro',
] as const satisfies readonly SceneV1['type'][];

const SUPPORTED_ASPECT_RATIOS = ['9:16', '16:9', '1:1'] as const;

function getAspectRatio(width: number, height: number): TemplateAspectRatio | undefined {
  if (width === height) {
    return '1:1';
  }

  if (width * 16 === height * 9) {
    return '9:16';
  }

  if (width * 9 === height * 16) {
    return '16:9';
  }

  return undefined;
}

function issue(code: string, path: string, message: string): TemplateValidationIssue {
  return { code, path, message };
}

export function validateNewsCleanV1(project: ProjectDocumentV1) {
  const errors: TemplateValidationIssue[] = [];
  const warnings: TemplateValidationIssue[] = [];
  const aspectRatio = getAspectRatio(project.composition.width, project.composition.height);

  if (aspectRatio === undefined || !SUPPORTED_ASPECT_RATIOS.includes(aspectRatio)) {
    errors.push(
      issue(
        'UNSUPPORTED_ASPECT_RATIO',
        'composition',
        'News Clean supports only 9:16, 16:9 and 1:1 compositions.',
      ),
    );
  }

  project.scenes.forEach((scene, sceneIndex) => {
    const path = `scenes.${sceneIndex}`;

    if (!NEWS_CLEAN_V1_SCENE_TYPES.includes(scene.type)) {
      errors.push(
        issue(
          'UNSUPPORTED_SCENE_TYPE',
          `${path}.type`,
          `Scene type "${scene.type}" is not supported by News Clean.`,
        ),
      );
    }

    if ((scene.type === 'image' || scene.type === 'video') && scene.media === undefined) {
      errors.push(
        issue(
          'MEDIA_REQUIRED',
          `${path}.media`,
          `${scene.type === 'image' ? 'Image' : 'Video'} scenes require a media asset.`,
        ),
      );
    }

    if ((scene.text.headline?.length ?? 0) > 140) {
      warnings.push(
        issue(
          'LONG_HEADLINE',
          `${path}.text.headline`,
          'Headlines longer than 140 characters may render at a smaller size.',
        ),
      );
    }

    if ((scene.text.bullets?.length ?? 0) > 6) {
      warnings.push(
        issue(
          'MANY_BULLETS',
          `${path}.text.bullets`,
          'More than six bullets may reduce readability.',
        ),
      );
    }

    if (
      ['content', 'image', 'video', 'bullet-list', 'quote'].includes(scene.type) &&
      (scene.text.source?.trim().length ?? 0) === 0
    ) {
      warnings.push(
        issue(
          'SOURCE_RECOMMENDED',
          `${path}.text.source`,
          'Editorial scenes should include a source.',
        ),
      );
    }
  });

  return { errors, warnings };
}

export const newsCleanV1: TemplateManifest = {
  id: NEWS_CLEAN_V1_ID,
  version: 1,
  name: 'News Clean',
  description: 'A calm, modern editorial template for Vietnamese news videos.',
  thumbnailAsset: '/templates/news-clean-v1/thumbnail.webp',
  supportedAspectRatios: SUPPORTED_ASPECT_RATIOS,
  supportedSceneTypes: NEWS_CLEAN_V1_SCENE_TYPES,
  variants: [
    {
      id: 'default',
      name: 'Editorial',
    },
    {
      id: 'compact',
      name: 'Compact',
    },
  ],
  defaultProjectPatch: {
    composition: {
      width: 1080,
      height: 1920,
      fps: 30,
      backgroundColor: '#F4F1EB',
    },
    theme: {
      primaryColor: '#0E2238',
      secondaryColor: '#E8E2D8',
      accentColor: '#D85C32',
      textColor: '#13202C',
      mutedTextColor: '#52616D',
      fontFamily: 'BeVietnamPro',
    },
  },
  validate: validateNewsCleanV1,
  Component: createRegisteredTemplateComponent(NEWS_CLEAN_V1_ID),
};
