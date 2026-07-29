export {
  InvalidTemplateRegistryError,
  TemplateNotFoundError,
  TemplateRendererNotRegisteredError,
  TemplateVersionMismatchError,
} from './errors.js';
export {
  createRegisteredTemplateComponent,
  registerTemplateRenderer,
} from './renderer-registry.js';
export {
  defineTemplateRegistry,
  getTemplate,
  listTemplateMetadata,
  templateRegistry,
} from './registry.js';
export {
  NEWS_CLEAN_V1_ID,
  NEWS_CLEAN_V1_SCENE_TYPES,
  newsCleanV1,
  validateNewsCleanV1,
} from './templates/news-clean-v1.js';
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
