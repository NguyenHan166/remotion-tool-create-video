import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@fontsource/be-vietnam-pro/vietnamese-800.css';
import { registerTemplateRenderer, WARNING_DARK_V1_ID } from '@hansys/template-registry';
import { WarningDarkV1Template } from './Template.js';

registerTemplateRenderer(WARNING_DARK_V1_ID, WarningDarkV1Template);

export { InvalidTemplateProjectError, MissingTemplateAssetError } from './errors.js';
export {
  WarningSafeArea,
  WarningSharedLayers,
  WarningSourceBadge,
  WarningText,
  WarningIcon,
  getWarningHeadlineFontSize,
  resolveSceneSource,
  resolveSceneAsset,
} from './components.js';
export { WarningDarkV1Template } from './Template.js';
export { WarningSceneRenderer, type WarningSceneProps } from './SceneRenderer.js';
export {
  BackgroundMusicLayer,
  getBackgroundMusicLayerConfig,
  getBackgroundMusicVolume,
  type BackgroundMusicLayerConfig,
} from '../news-clean-v1/BackgroundMusicLayer.js';
export {
  CaptionLayer,
  getActiveCaptionEntry,
  getActiveCaptionPage,
  getCaptionPages,
  getHighlightedCaptionWordIndex,
  type CaptionPage,
  type CaptionWord,
} from '../news-clean-v1/CaptionLayer.js';
export {
  getVoiceoverLayerConfig,
  VoiceoverLayer,
  type VoiceoverLayerConfig,
} from '../news-clean-v1/VoiceoverLayer.js';
export { WARNING_DARK_COLORS, WARNING_DARK_FONT_FAMILY, WARNING_DARK_SAFE_AREA } from './tokens.js';
export {
  WARNING_DARK_V1_ID,
  WARNING_DARK_V1_SCENE_TYPES,
  validateWarningDarkV1,
  warningDarkV1,
} from './manifest.js';
