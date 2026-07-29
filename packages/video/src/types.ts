import { type ProjectDocumentV1Input } from '@hansys/project-schema';
import { type TemplateAsset } from '@hansys/template-registry';

export type ResolvedAsset = TemplateAsset;

export type VideoProps = {
  project: ProjectDocumentV1Input;
  assets: Record<string, ResolvedAsset>;
};
