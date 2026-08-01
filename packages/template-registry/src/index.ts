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
export { TEMPLATE_THEME_CONTROLS, validateTemplateSupport } from './support.js';
export {
  BREAKING_RED_V1_ID,
  BREAKING_RED_V1_SCENE_TYPES,
  breakingRedV1,
  validateBreakingRedV1,
} from './templates/breaking-red-v1.js';
export {
  NEWS_CLEAN_V1_ID,
  NEWS_CLEAN_V1_SCENE_TYPES,
  newsCleanV1,
  validateNewsCleanV1,
} from './templates/news-clean-v1.js';
export {
  WARNING_DARK_V1_ID,
  WARNING_DARK_V1_SCENE_TYPES,
  validateWarningDarkV1,
  warningDarkV1,
} from './templates/warning-dark-v1.js';
export type {
  TemplateAspectRatio,
  TemplateAsset,
  TemplateComponentProps,
  TemplateManifest,
  TemplateMetadata,
  TemplateRegistry,
  TemplateValidationIssue,
  TemplateValidationResult,
  TemplateThemeControl,
  TemplateVariant,
} from './types.js';
