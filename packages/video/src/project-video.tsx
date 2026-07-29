import { ProjectDocumentSchema } from '@hansys/project-schema';
import { AbsoluteFill } from 'remotion';
import { type ResolvedAsset, type VideoProps } from './types.js';

export function ProjectVideo({ project: projectInput }: VideoProps) {
  const project = ProjectDocumentSchema.parse(projectInput);

  return (
    <AbsoluteFill
      style={{
        alignItems: 'flex-start',
        backgroundColor: project.composition.backgroundColor,
        color: project.theme.textColor,
        fontFamily: project.theme.fontFamily,
        justifyContent: 'center',
        padding: '8%',
      }}
    >
      <div
        style={{
          color: project.theme.accentColor,
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: 'uppercase',
        }}
      >
        {project.template.id}
      </div>
      <div
        style={{
          fontSize: 76,
          fontWeight: 800,
          lineHeight: 1.1,
          marginTop: 28,
          maxWidth: '90%',
        }}
      >
        {project.metadata.title}
      </div>
    </AbsoluteFill>
  );
}

export {
  calculateProjectMetadata,
  getTotalDurationInFrames,
  parseProjectDocument,
} from './metadata.js';
export type { ResolvedAsset, VideoProps };
