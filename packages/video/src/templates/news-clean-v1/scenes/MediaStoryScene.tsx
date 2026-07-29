import { AbsoluteFill, useVideoConfig } from 'remotion';
import {
  MediaFrame,
  ResponsiveText,
  SafeArea,
  SourceBadge,
  resolveSceneAsset,
} from '../components.js';
import { type NewsCleanSceneProps } from '../SceneRenderer.js';
import { NEWS_CLEAN_COLORS } from '../tokens.js';

export function MediaStoryScene(props: NewsCleanSceneProps) {
  const { project, scene, assets } = props;
  const { width, height } = useVideoConfig();
  const asset = resolveSceneAsset(scene, assets);
  const landscape = width > height;

  if (asset === undefined) {
    return null;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: NEWS_CLEAN_COLORS.paper }}>
      <SafeArea
        captionsEnabled={project.captions.enabled}
        style={{
          flexDirection: landscape ? 'row' : 'column',
          gap: landscape ? '4%' : '3%',
          justifyContent: 'center',
          paddingTop: '10%',
        }}
      >
        <MediaFrame
          asset={asset}
          scene={scene}
          style={{
            flex: landscape ? '1.35 1 0' : '0 0 52%',
            minHeight: 0,
            minWidth: 0,
          }}
        />
        <div
          style={{
            display: 'flex',
            flex: '1 1 0',
            flexDirection: 'column',
            gap: 24,
            justifyContent: 'center',
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <ResponsiveText
            align={scene.style.textAlign}
            kind="headline"
            maxLines={4}
            text={scene.text.headline}
          />
          <ResponsiveText
            align={scene.style.textAlign}
            color={NEWS_CLEAN_COLORS.muted}
            kind="body"
            maxLines={landscape ? 5 : 4}
            text={scene.text.body}
          />
          <SourceBadge source={scene.text.source} />
        </div>
      </SafeArea>
    </AbsoluteFill>
  );
}
