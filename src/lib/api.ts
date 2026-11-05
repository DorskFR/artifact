import type { ArtifactDetail, ArtifactSummary } from './view.ts';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const listArtifacts = () => get<ArtifactSummary[]>('/_api/artifacts');
export const getArtifact = (id: string) => get<ArtifactDetail>(`/_api/artifacts/${id}`);
