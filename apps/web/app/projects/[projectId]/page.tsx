import { type Metadata } from 'next';
import { ProjectEditor } from './project-editor';

export const metadata: Metadata = {
  title: 'Trình chỉnh sửa',
};

export default async function ProjectEditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return <ProjectEditor projectId={projectId} />;
}
