import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@fontsource/be-vietnam-pro/vietnamese-800.css';
import { NEWS_CLEAN_V1_ID, registerTemplateRenderer } from '@hansys/template-registry';
import { NewsCleanV1Template } from './Template.js';

registerTemplateRenderer(NEWS_CLEAN_V1_ID, NewsCleanV1Template);

export {
  InvalidTemplateProjectError,
  MissingBackgroundMusicAssetError,
  MissingTemplateAssetError,
  MissingVoiceoverAssetError,
} from './errors.js';
export {
  CaptionLayer,
  getActiveCaptionEntry,
  getActiveCaptionPage,
  getCaptionPages,
  getHighlightedCaptionWordIndex,
  type CaptionPage,
  type CaptionWord,
} from './CaptionLayer.js';
export {
  BackgroundMusicLayer,
  getBackgroundMusicLayerConfig,
  getBackgroundMusicVolume,
  type BackgroundMusicLayerConfig,
} from './BackgroundMusicLayer.js';
export { NewsCleanV1Template } from './Template.js';
export { resolveSceneSource } from './components.js';
export {
  getVoiceoverLayerConfig,
  VoiceoverLayer,
  type VoiceoverLayerConfig,
} from './VoiceoverLayer.js';
export {
  NEWS_CLEAN_V1_ID,
  NEWS_CLEAN_V1_SCENE_TYPES,
  newsCleanV1,
  validateNewsCleanV1,
} from './manifest.js';
