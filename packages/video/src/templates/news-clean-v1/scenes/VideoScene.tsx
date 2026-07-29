import { type NewsCleanSceneProps } from '../SceneRenderer.js';
import { MediaStoryScene } from './MediaStoryScene.js';

export function VideoScene(props: NewsCleanSceneProps) {
  return <MediaStoryScene {...props} />;
}
