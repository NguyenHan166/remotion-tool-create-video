import { type ProjectDocumentV1, type SceneV1 } from '@hansys/project-schema';
import { createRegisteredTemplateComponent } from '../renderer-registry.js';
import {
  type TemplateAspectRatio,
  type TemplateManifest,
  type TemplateValidationIssue,
} from '../types.js';

export const BREAKING_RED_V1_ID = 'breaking-red-v1';

export const BREAKING_RED_V1_SCENE_TYPES = [
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

export function validateBreakingRedV1(project: ProjectDocumentV1) {
  const errors: TemplateValidationIssue[] = [];
  const warnings: TemplateValidationIssue[] = [];
  const aspectRatio = getAspectRatio(project.composition.width, project.composition.height);

  if (aspectRatio === undefined || !SUPPORTED_ASPECT_RATIOS.includes(aspectRatio)) {
    errors.push(
      issue(
        'UNSUPPORTED_ASPECT_RATIO',
        'composition',
        'Breaking Red supports only 9:16, 16:9 and 1:1 compositions.',
      ),
    );
  }

  project.scenes.forEach((scene, sceneIndex) => {
    const path = `scenes.${sceneIndex}`;
    const source = scene.text.source ?? project.theme.sourceText;

    if (!BREAKING_RED_V1_SCENE_TYPES.includes(scene.type)) {
      errors.push(
        issue(
          'UNSUPPORTED_SCENE_TYPE',
          `${path}.type`,
          `Scene type "${scene.type}" is not supported by Breaking Red.`,
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
          'Headlines longer than 140 characters use adaptive sizing to preserve legibility.',
        ),
      );
    }

    if ((scene.text.bullets?.length ?? 0) > 5) {
      warnings.push(
        issue(
          'MANY_BULLETS',
          `${path}.text.bullets`,
          'More than five bullets may reduce the urgency layout readability.',
        ),
      );
    }

    if (
      ['content', 'image', 'video', 'bullet-list', 'quote'].includes(scene.type) &&
      (source?.trim().length ?? 0) === 0
    ) {
      warnings.push(
        issue(
          'SOURCE_RECOMMENDED',
          `${path}.text.source`,
          'Breaking editorial scenes should include a source.',
        ),
      );
    }
  });

  return { errors, warnings };
}

export const breakingRedV1: TemplateManifest = {
  id: BREAKING_RED_V1_ID,
  version: 1,
  name: 'Breaking Red',
  description: 'A high-contrast breaking-news template with fast, urgent motion.',
  thumbnailAsset: '/templates/breaking-red-v1/thumbnail.webp',
  supportedAspectRatios: SUPPORTED_ASPECT_RATIOS,
  supportedSceneTypes: BREAKING_RED_V1_SCENE_TYPES,
  themeControls: ['colors', 'font', 'logo', 'watermark', 'source'],
  variants: [
    {
      id: 'default',
      name: 'Breaking',
    },
    {
      id: 'urgent',
      name: 'Urgent Flash',
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
      backgroundColor: '#120507',
    },
    theme: {
      primaryColor: '#E11D2E',
      secondaryColor: '#320910',
      accentColor: '#FFD166',
      textColor: '#FFF8F5',
      mutedTextColor: '#F4A5A9',
      fontFamily: 'BeVietnamPro',
    },
  },
  validate: validateBreakingRedV1,
  Component: createRegisteredTemplateComponent(BREAKING_RED_V1_ID),
};
