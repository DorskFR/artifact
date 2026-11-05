import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decodeEntities,
  extractTitle,
  kindOf,
  listArtifacts,
  pickEntry,
  readArtifact,
} from './index.ts';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
let root: string;

async function put(id: string, path: string, body: string, mtime: number) {
  const abs = join(root, id, path);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body);
  await utimes(abs, mtime, mtime);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'artifact-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('pickEntry', () => {
  it('prefers index.html', () => {
    expect(pickEntry(['a.png', 'index.html', 'b/c.html'])).toBe('index.html');
  });
  it('takes the only top-level file', () => {
    expect(pickEntry(['report.pdf', 'img/x.png'])).toBe('report.pdf');
  });
  it('ranks html over images over the rest', () => {
    expect(pickEntry(['notes.txt', 'shot.png', 'stack.html'])).toBe('stack.html');
    expect(pickEntry(['notes.txt', 'shot.png'])).toBe('shot.png');
  });
  it('falls back to a nested file when nothing is top-level', () => {
    expect(pickEntry(['before/a.png'])).toBe('before/a.png');
  });
});

describe('titles', () => {
  it('reads <title> and decodes entities', () => {
    expect(extractTitle('html', '<head><title>cctui — settings &amp; redesign\n</title>')).toBe(
      'cctui — settings & redesign',
    );
  });
  it('falls back to the first h1', () => {
    expect(extractTitle('html', '<body><h1 class="x">Hello <em>there</em></h1>')).toBe(
      'Hello there',
    );
  });
  it('reads the first markdown heading', () => {
    expect(extractTitle('markdown', 'intro\n# Migrating to `0.80`\n')).toBe('Migrating to 0.80');
  });
  it('decodes numeric entities', () => {
    expect(decodeEntities('&#x2014;&#39;&bogus;')).toBe("—'&bogus;");
  });
  it('maps extensions to kinds', () => {
    expect(kindOf('a/B.PNG')).toBe('image');
    expect(kindOf('x.patch')).toBe('text');
    expect(kindOf('Makefile')).toBe('other');
  });
});

describe('scan', () => {
  it('summarises artifacts newest first and ignores non-id dirs', async () => {
    await put(A, 'index.html', '<title>Old one</title>', 1_000);
    await put(A, 'img/x.png', 'png', 2_000);
    await put(B, 'theme-preview.png', 'png!', 5_000);
    await mkdir(join(root, 'not-an-id'));
    const list = await listArtifacts(root);
    expect(list.map((a) => a.id)).toEqual([B, A]);
    expect(list[1]).toMatchObject({
      title: 'Old one',
      entry: 'index.html',
      kind: 'html',
      created: 1_000_000,
      updated: 2_000_000,
      size: 25,
      files: 2,
      thumbnailable: true,
    });
    expect(list[0]).toMatchObject({ title: 'theme-preview.png', kind: 'image' });
    expect(list[0]).not.toHaveProperty('tree');
  });

  it('returns the file tree for one artifact and rejects bad ids', async () => {
    await put(A, 'b.txt', 'b', 1);
    await put(A, 'a/z.txt', 'z', 1);
    const a = await readArtifact(root, A);
    expect(a?.tree.map((f) => f.path)).toEqual(['a/z.txt', 'b.txt']);
    expect(await readArtifact(root, '../etc')).toBeUndefined();
    expect(await readArtifact(root, B)).toBeUndefined();
  });

  it('uses the id as the title when nothing better exists', async () => {
    await put(A, 'index.html', '<p>no title</p>', 1);
    expect((await readArtifact(root, A))?.title).toBe(A);
  });
});
