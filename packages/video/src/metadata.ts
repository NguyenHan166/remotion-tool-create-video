import {
  ProjectDocumentSchema,
  type ProjectDocumentV1,
  type ProjectDocumentV1Input,
} from '@hansys/project-schema';
import { type CalculateMetadataFunction } from 'remotion';
import { type VideoProps } from './types.js';

export function getTotalDurationInFrames(project: ProjectDocumentV1): number {
  return project.scenes
    .filter((scene) => scene.enabled)
    .reduce((total, scene) => total + scene.durationInFrames, 0);
}

export function parseProjectDocument(project: ProjectDocumentV1Input): ProjectDocumentV1 {
  return ProjectDocumentSchema.parse(project);
}

export const calculateProjectMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => {
  const project = parseProjectDocument(props.project);

  return {
    durationInFrames: getTotalDurationInFrames(project),
    width: project.composition.width,
    height: project.composition.height,
    fps: project.composition.fps,
    defaultCodec: 'h264',
    props: {
      ...props,
      project,
    },
  };
};
