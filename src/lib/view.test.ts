import { describe, expect, it } from 'vitest';
import {
  type ArtifactSummary,
  arrange,
  entryUrl,
  formatBytes,
  groupByDay,
  kindCounts,
} from './view.ts';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 5, 12).getTime();

const art = (id: string, over: Partial<ArtifactSummary> = {}): ArtifactSummary => ({
  id: id.padEnd(32, '0'),
  title: id,
  entry: 'index.html',
  kind: 'html',
  created: NOW,
  updated: NOW,
  size: 1,
  files: 1,
  thumbnailable: true,
  ...over,
});

describe('arrange', () => {
  const items = [
    art('alpha', { created: NOW - 2 * DAY, size: 50, title: 'Kusaritoi review' }),
    art('beta', { created: NOW, kind: 'image', title: 'theme-preview.png' }),
    art('gamma', { created: NOW - DAY, size: 900, title: 'Agent skill stacks' }),
  ];

  it('sorts newest first by default', () => {
    expect(arrange(items, '', 'all', 'newest').map((a) => a.title)).toEqual([
      'theme-preview.png',
      'Agent skill stacks',
      'Kusaritoi review',
    ]);
  });

  it('filters by every search term and by kind', () => {
    expect(arrange(items, 'skill AGENT', 'all', 'newest').map((a) => a.title)).toEqual([
      'Agent skill stacks',
    ]);
    expect(arrange(items, '', 'image', 'newest')).toHaveLength(1);
    expect(arrange(items, 'gamma', 'all', 'newest')).toHaveLength(1);
  });

  it('sorts by size and title', () => {
    expect(arrange(items, '', 'all', 'largest')[0]?.title).toBe('Agent skill stacks');
    expect(arrange(items, '', 'all', 'title')[0]?.title).toBe('Agent skill stacks');
  });
});

describe('groupByDay', () => {
  it('buckets consecutive items under day labels', () => {
    const groups = groupByDay(
      [art('a'), art('b', { created: NOW - 3_600_000 }), art('c', { created: NOW - DAY })],
      'newest',
      NOW,
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
    ]);
  });

  it('uses one flat group for non-date sorts', () => {
    expect(groupByDay([art('a'), art('b', { created: 0 })], 'title', NOW)).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('links to the directory for index.html and to the file otherwise', () => {
    expect(entryUrl({ id: 'x', entry: 'index.html' })).toBe('/a/x/');
    expect(entryUrl({ id: 'x', entry: 'my file.png' })).toBe('/a/x/my%20file.png');
  });
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(83 * 1024 * 1024)).toBe('83 MB');
  });
  it('counts kinds', () => {
    expect(kindCounts([art('a'), art('b'), art('c', { kind: 'pdf' })]).get('html')).toBe(2);
  });
});
