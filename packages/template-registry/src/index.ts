export {
  InvalidTemplateRegistryError,
  TemplateNotFoundError,
  TemplateVersionMismatchError,
} from './errors.js';
export {
  defineTemplateRegistry,
  getTemplate,
  listTemplateMetadata,
  templateRegistry,
} from './registry.js';
export type {
  TemplateAspectRatio,
  TemplateAsset,
  TemplateComponentProps,
  TemplateManifest,
  TemplateMetadata,
  TemplateRegistry,
  TemplateValidationIssue,
  TemplateValidationResult,
  TemplateVariant,
} from './types.js';
