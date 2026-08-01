import { type SceneV1 } from '@hansys/project-schema';
import { type TemplateComponentProps } from '@hansys/template-registry';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import {
  BreakingBulletListScene,
  BreakingContentScene,
  BreakingHeadlineScene,
  BreakingHookScene,
  BreakingMediaScene,
  BreakingOutroScene,
  BreakingQuoteScene,
} from './scenes/BreakingScenes.js';

export type BreakingSceneProps = TemplateComponentProps & {
  scene: SceneV1;
};

function getEntranceStyle(scene: SceneV1, frame: number) {
  const duration = Math.max(
    1,
    Math.min(scene.transition?.durationInFrames ?? 8, Math.floor(scene.durationInFrames * 0.16)),
  );
  const progress = interpolate(frame, [0, duration], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const transitionType = scene.transition?.type ?? 'slide-left';
  const x = transitionType === 'slide-left' ? (1 - progress) * 100 : 0;
  const y = transitionType === 'slide-up' ? (1 - progress) * 84 : 0;

  return {
    opacity: transitionType === 'none' ? 1 : progress,
    transform: `translate3d(${x}px, ${y}px, 0)`,
  };
}

export function BreakingSceneRenderer(props: BreakingSceneProps) {
  const frame = useCurrentFrame();
  const { scene } = props;
  let content;

  switch (scene.type) {
    case 'hook':
      content = <BreakingHookScene {...props} />;
      break;
    case 'headline':
      content = <BreakingHeadlineScene {...props} />;
      break;
    case 'content':
      content = <BreakingContentScene {...props} />;
      break;
    case 'image':
    case 'video':
      content = <BreakingMediaScene {...props} />;
      break;
    case 'bullet-list':
      content = <BreakingBulletListScene {...props} />;
      break;
    case 'quote':
      content = <BreakingQuoteScene {...props} />;
      break;
    case 'outro':
      content = <BreakingOutroScene {...props} />;
      break;
  }

  return (
    <div style={{ height: '100%', width: '100%', ...getEntranceStyle(scene, frame) }}>
      {content}
    </div>
  );
}
