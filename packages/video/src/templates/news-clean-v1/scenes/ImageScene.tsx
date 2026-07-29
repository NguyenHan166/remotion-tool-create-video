import { type NewsCleanSceneProps } from '../SceneRenderer.js';
import { MediaStoryScene } from './MediaStoryScene.js';

export function ImageScene(props: NewsCleanSceneProps) {
  return <MediaStoryScene {...props} />;
}
