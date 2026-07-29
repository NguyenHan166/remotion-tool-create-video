import { type ProjectDocumentV1, type SceneV1 } from '@hansys/project-schema';
import { type ComponentType } from 'react';

export type TemplateAspectRatio = '9:16' | '16:9' | '1:1';

export type TemplateAsset = {
  id: string;
  kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'LOGO';
  src: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type TemplateComponentProps = {
  project: ProjectDocumentV1;
  assets: Record<string, TemplateAsset>;
};

export type TemplateVariant = {
  id: string;
  name: string;
};

export type TemplateValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type TemplateValidationResult = {
  errors: readonly TemplateValidationIssue[];
  warnings: readonly TemplateValidationIssue[];
};

export type TemplateManifest = {
  id: string;
  version: number;
  name: string;
  description: string;
  thumbnailAsset: string;
  supportedAspectRatios: readonly TemplateAspectRatio[];
  supportedSceneTypes: readonly SceneV1['type'][];
  variants: readonly TemplateVariant[];
  defaultProjectPatch: Partial<ProjectDocumentV1>;
  validate: (project: ProjectDocumentV1) => TemplateValidationResult;
  Component: ComponentType<TemplateComponentProps>;
};

export type TemplateRegistry = Readonly<Record<string, TemplateManifest>>;

export type TemplateMetadata = Omit<TemplateManifest, 'Component' | 'validate'>;
