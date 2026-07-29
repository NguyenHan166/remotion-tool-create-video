import { type ProjectDocumentV1Input } from '@hansys/project-schema';

export type ResolvedAsset = {
  id: string;
  kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'LOGO';
  src: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type VideoProps = {
  project: ProjectDocumentV1Input;
  assets: Record<string, ResolvedAsset>;
};
