import { type ProjectDocumentV1, type SceneV1 } from '@hansys/project-schema';
import { createRegisteredTemplateComponent } from '../renderer-registry.js';
import {
  type TemplateAspectRatio,
  type TemplateManifest,
  type TemplateValidationIssue,
} from '../types.js';

export const WARNING_DARK_V1_ID = 'warning-dark-v1';

export const WARNING_DARK_V1_SCENE_TYPES = [
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

export function validateWarningDarkV1(project: ProjectDocumentV1) {
  const errors: TemplateValidationIssue[] = [];
  const warnings: TemplateValidationIssue[] = [];
  const aspectRatio = getAspectRatio(project.composition.width, project.composition.height);

  if (aspectRatio === undefined || !SUPPORTED_ASPECT_RATIOS.includes(aspectRatio)) {
    errors.push(
      issue(
        'UNSUPPORTED_ASPECT_RATIO',
        'composition',
        'Warning Dark supports only 9:16, 16:9 and 1:1 compositions.',
      ),
    );
  }

  project.scenes.forEach((scene, sceneIndex) => {
    const path = `scenes.${sceneIndex}`;

    if (!WARNING_DARK_V1_SCENE_TYPES.includes(scene.type)) {
      errors.push(
        issue(
          'UNSUPPORTED_SCENE_TYPE',
          `${path}.type`,
          `Scene type "${scene.type}" is not supported by Warning Dark.`,
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

    if ((scene.text.headline?.length ?? 0) > 160) {
      warnings.push(
        issue(
          'LONG_HEADLINE',
          `${path}.text.headline`,
          'Headlines longer than 160 characters use adaptive sizing to preserve warning legibility.',
        ),
      );
    }

    if ((scene.text.bullets?.length ?? 0) > 6) {
      warnings.push(
        issue(
          'MANY_BULLETS',
          `${path}.text.bullets`,
          'More than six bullets may reduce the warning layout readability.',
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
          'Warning editorial scenes should include a source.',
        ),
      );
    }
  });

  return { errors, warnings };
}

export const warningDarkV1: TemplateManifest = {
  id: WARNING_DARK_V1_ID,
  version: 1,
  name: 'Warning Dark',
  description: 'A dark warning template for scam, cyber and public-safety alerts.',
  thumbnailAsset: '/templates/warning-dark-v1/thumbnail.webp',
  supportedAspectRatios: SUPPORTED_ASPECT_RATIOS,
  supportedSceneTypes: WARNING_DARK_V1_SCENE_TYPES,
  variants: [
    {
      id: 'default',
      name: 'Alert',
    },
    {
      id: 'cyber',
      name: 'Cyber Safety',
    },
    {
      id: 'scam',
      name: 'Scam Warning',
    },
  ],
  defaultProjectPatch: {
    composition: {
      width: 1080,
      height: 1920,
      fps: 30,
      backgroundColor: '#090A0F',
    },
    theme: {
      primaryColor: '#F04438',
      secondaryColor: '#171A24',
      accentColor: '#F7C948',
      textColor: '#F8FAFC',
      mutedTextColor: '#AAB2C0',
      fontFamily: 'BeVietnamPro',
    },
  },
  validate: validateWarningDarkV1,
  Component: createRegisteredTemplateComponent(WARNING_DARK_V1_ID),
};
