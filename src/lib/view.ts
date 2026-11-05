import type { ArtifactSummary, Kind } from '../../server/types.ts';

export type { ArtifactDetail, ArtifactFile, ArtifactSummary, Kind } from '../../server/types.ts';

export type Sort = 'newest' | 'oldest' | 'updated' | 'largest' | 'title';
export type KindFilter = Kind | 'all';

export const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'largest', label: 'Largest' },
  { value: 'title', label: 'Title' },
];

export const KIND_LABEL: Record<Kind, string> = {
  html: 'Page',
  image: 'Image',
  pdf: 'PDF',
  markdown: 'Markdown',
  text: 'Text',
  audio: 'Audio',
  video: 'Video',
  other: 'Other',
};

export const KIND_ICON = {
  html: 'file-text',
  image: 'image',
  pdf: 'book',
  markdown: 'markdown',
  text: 'file',
  audio: 'music',
  video: 'film',
  other: 'folder',
} as const satisfies Record<Kind, string>;

export function entryUrl(a: Pick<ArtifactSummary, 'id' | 'entry'>): string {
  const entry =
    a.entry === 'index.html' ? '' : a.entry.split('/').map(encodeURIComponent).join('/');
  return `/a/${a.id}/${entry}`;
}

export function fileUrl(id: string, path: string): string {
  return `/a/${id}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function thumbUrl(a: Pick<ArtifactSummary, 'id' | 'updated'>): string {
  return `/_api/thumbs/${a.id}?v=${a.updated}`;
}

export function matches(a: ArtifactSummary, query: string, kind: KindFilter): boolean {
  if (kind !== 'all' && a.kind !== kind) return false;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = `${a.title} ${a.id} ${a.entry} ${a.kind}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

const COMPARE: Record<Sort, (a: ArtifactSummary, b: ArtifactSummary) => number> = {
  newest: (a, b) => b.created - a.created,
  oldest: (a, b) => a.created - b.created,
  updated: (a, b) => b.updated - a.updated,
  largest: (a, b) => b.size - a.size,
  title: (a, b) => a.title.localeCompare(b.title),
};

export function arrange(
  items: readonly ArtifactSummary[],
  query: string,
  kind: KindFilter,
  sort: Sort,
): ArtifactSummary[] {
  return items.filter((a) => matches(a, query, kind)).sort(COMPARE[sort]);
}

export interface Group {
  key: string;
  label: string;
  items: ArtifactSummary[];
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayLabel(ms: number, now = Date.now()): string {
  const key = dayKey(ms);
  if (key === dayKey(now)) return 'Today';
  if (key === dayKey(now - 86_400_000)) return 'Yesterday';
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function groupByDay(
  items: readonly ArtifactSummary[],
  sort: Sort,
  now = Date.now(),
): Group[] {
  if (sort === 'largest' || sort === 'title') return [{ key: 'all', label: '', items: [...items] }];
  const field = sort === 'updated' ? 'updated' : 'created';
  const groups: Group[] = [];
  for (const a of items) {
    const key = dayKey(a[field]);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(a);
    else groups.push({ key, label: dayLabel(a[field], now), items: [a] });
  }
  return groups;
}

export function kindCounts(items: readonly ArtifactSummary[]): Map<Kind, number> {
  const out = new Map<Kind, number>();
  for (const a of items) out.set(a.kind, (out.get(a.kind) ?? 0) + 1);
  return out;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
