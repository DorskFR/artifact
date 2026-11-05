export type Kind = 'html' | 'image' | 'pdf' | 'markdown' | 'text' | 'audio' | 'video' | 'other';

export interface ArtifactFile {
  path: string;
  size: number;
  mtime: number;
}

export interface ArtifactSummary {
  id: string;
  title: string;
  entry: string;
  kind: Kind;
  created: number;
  updated: number;
  size: number;
  files: number;
  thumbnailable: boolean;
}

export interface ArtifactDetail extends ArtifactSummary {
  tree: ArtifactFile[];
}
