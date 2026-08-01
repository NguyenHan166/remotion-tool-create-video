import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@fontsource/be-vietnam-pro/vietnamese-800.css';
import { BREAKING_RED_V1_ID, registerTemplateRenderer } from '@hansys/template-registry';
import { BreakingRedV1Template } from './Template.js';

registerTemplateRenderer(BREAKING_RED_V1_ID, BreakingRedV1Template);

export { InvalidTemplateProjectError, MissingTemplateAssetError } from './errors.js';
export { BreakingRedV1Template } from './Template.js';
export { BreakingSceneRenderer, type BreakingSceneProps } from './SceneRenderer.js';
export { getBreakingHeadlineFontSize, resolveSceneSource } from './components.js';
export {
  BREAKING_RED_V1_ID,
  BREAKING_RED_V1_SCENE_TYPES,
  breakingRedV1,
  validateBreakingRedV1,
} from './manifest.js';
