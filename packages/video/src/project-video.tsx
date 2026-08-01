import { ProjectDocumentSchema } from '@hansys/project-schema';
import { getTemplate } from '@hansys/template-registry';
import './templates/breaking-red-v1/index.js';
import './templates/news-clean-v1/index.js';
import { type ResolvedAsset, type VideoProps } from './types.js';

export function ProjectVideo({ project: projectInput, assets }: VideoProps) {
  const project = ProjectDocumentSchema.parse(projectInput);
  const manifest = getTemplate(project.template.id, project.template.version);
  const Template = manifest.Component;

  return <Template assets={assets} project={project} />;
}

export {
  calculateProjectMetadata,
  getTotalDurationInFrames,
  parseProjectDocument,
} from './metadata.js';
export type { ResolvedAsset, VideoProps };
