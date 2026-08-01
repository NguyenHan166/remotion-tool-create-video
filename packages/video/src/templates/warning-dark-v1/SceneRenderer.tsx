import { type SceneV1 } from '@hansys/project-schema';
import { type TemplateComponentProps } from '@hansys/template-registry';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import {
  WarningBulletListScene,
  WarningContentScene,
  WarningHeadlineScene,
  WarningHookScene,
  WarningMediaScene,
  WarningOutroScene,
  WarningQuoteScene,
} from './scenes/WarningScenes.js';

export type WarningSceneProps = TemplateComponentProps & {
  scene: SceneV1;
};

function getEntranceStyle(scene: SceneV1, frame: number) {
  const duration = Math.max(
    1,
    Math.min(scene.transition?.durationInFrames ?? 10, Math.floor(scene.durationInFrames * 0.2)),
  );
  const progress = interpolate(frame, [0, duration], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const transitionType = scene.transition?.type ?? 'fade';
  const x = transitionType === 'slide-left' ? (1 - progress) * 64 : 0;
  const y = transitionType === 'slide-up' ? (1 - progress) * 56 : 0;

  return {
    opacity: transitionType === 'none' ? 1 : progress,
    transform: `translate3d(${x}px, ${y}px, 0)`,
  };
}

export function WarningSceneRenderer(props: WarningSceneProps) {
  const frame = useCurrentFrame();
  const { scene } = props;
  let content;

  switch (scene.type) {
    case 'hook':
      content = <WarningHookScene {...props} />;
      break;
    case 'headline':
      content = <WarningHeadlineScene {...props} />;
      break;
    case 'content':
      content = <WarningContentScene {...props} />;
      break;
    case 'image':
    case 'video':
      content = <WarningMediaScene {...props} />;
      break;
    case 'bullet-list':
      content = <WarningBulletListScene {...props} />;
      break;
    case 'quote':
      content = <WarningQuoteScene {...props} />;
      break;
    case 'outro':
      content = <WarningOutroScene {...props} />;
      break;
  }

  return (
    <div style={{ height: '100%', width: '100%', ...getEntranceStyle(scene, frame) }}>
      {content}
    </div>
  );
}
