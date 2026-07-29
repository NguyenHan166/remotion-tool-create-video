import { type SceneV1 } from '@hansys/project-schema';
import { type TemplateComponentProps } from '@hansys/template-registry';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { BulletListScene } from './scenes/BulletListScene.js';
import { ContentScene } from './scenes/ContentScene.js';
import { HeadlineScene } from './scenes/HeadlineScene.js';
import { HookScene } from './scenes/HookScene.js';
import { ImageScene } from './scenes/ImageScene.js';
import { OutroScene } from './scenes/OutroScene.js';
import { QuoteScene } from './scenes/QuoteScene.js';
import { VideoScene } from './scenes/VideoScene.js';

export type NewsCleanSceneProps = TemplateComponentProps & {
  scene: SceneV1;
};

function getEntranceStyle(scene: SceneV1, frame: number) {
  const duration = Math.max(
    1,
    Math.min(scene.transition?.durationInFrames ?? 14, Math.floor(scene.durationInFrames * 0.25)),
  );
  const progress = interpolate(frame, [0, duration], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const transitionType = scene.transition?.type ?? 'fade';
  const x = transitionType === 'slide-left' ? (1 - progress) * 72 : 0;
  const y = transitionType === 'slide-up' ? (1 - progress) * 58 : 0;

  return {
    opacity: transitionType === 'none' ? 1 : progress,
    transform: `translate3d(${x}px, ${y}px, 0)`,
  };
}

export function SceneRenderer(props: NewsCleanSceneProps) {
  const frame = useCurrentFrame();
  const { scene } = props;
  const sceneProps = props;
  let content;

  switch (scene.type) {
    case 'hook':
      content = <HookScene {...sceneProps} />;
      break;
    case 'headline':
      content = <HeadlineScene {...sceneProps} />;
      break;
    case 'content':
      content = <ContentScene {...sceneProps} />;
      break;
    case 'image':
      content = <ImageScene {...sceneProps} />;
      break;
    case 'video':
      content = <VideoScene {...sceneProps} />;
      break;
    case 'bullet-list':
      content = <BulletListScene {...sceneProps} />;
      break;
    case 'quote':
      content = <QuoteScene {...sceneProps} />;
      break;
    case 'outro':
      content = <OutroScene {...sceneProps} />;
      break;
  }

  return (
    <div style={{ height: '100%', width: '100%', ...getEntranceStyle(scene, frame) }}>
      {content}
    </div>
  );
}
