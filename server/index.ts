import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArtifactDetail, ArtifactFile, ArtifactSummary, Kind } from './types.ts';

export const ID_RE = /^[0-9a-f]{32}$/;

const EXT_KIND: Record<string, Kind> = {
  html: 'html',
  htm: 'html',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  avif: 'image',
  pdf: 'pdf',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  log: 'text',
  patch: 'text',
  diff: 'text',
  json: 'text',
  yaml: 'text',
  yml: 'text',
  csv: 'text',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  flac: 'audio',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
};

const THUMBNAILABLE = new Set<Kind>(['html', 'image', 'pdf', 'markdown', 'text']);

export function kindOf(path: string): Kind {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return 'other';
  return EXT_KIND[path.slice(dot + 1).toLowerCase()] ?? 'other';
}

export function pickEntry(files: readonly string[]): string | undefined {
  const top = files.filter((f) => !f.includes('/'));
  if (top.includes('index.html')) return 'index.html';
  if (top.length === 1) return top[0];
  for (const kind of ['html', 'image', 'pdf', 'markdown', 'video', 'audio'] as const) {
    const hit = top.find((f) => kindOf(f) === kind);
    if (hit) return hit;
  }
  return top[0] ?? files[0];
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  middot: '·',
  hellip: '…',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ref: string) => {
    if (ref[0] === '#') {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[ref.toLowerCase()] ?? m;
  });
}

function clean(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTitle(kind: Kind, head: string): string | undefined {
  if (kind === 'html') {
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(head)?.[1];
    return [t, h1].map((v) => (v ? clean(v) : '')).find(Boolean);
  }
  if (kind === 'markdown') {
    const h = /^#{1,2}\s+(.+)$/m.exec(head)?.[1];
    return h ? h.replace(/[*_`]/g, '').trim() : undefined;
  }
  return undefined;
}

async function readHead(path: string, bytes = 65536): Promise<string> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await fh.close();
  }
}

async function walk(dir: string, prefix = ''): Promise<ArtifactFile[]> {
  const out: ArtifactFile[] = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walk(abs, rel)));
    else if (ent.isFile()) {
      const st = await stat(abs);
      out.push({ path: rel, size: st.size, mtime: Math.floor(st.mtimeMs) });
    }
  }
  return out;
}

const titles = new Map<string, { mtime: number; title: string | undefined }>();

async function titleFor(root: string, id: string, entry: string, kind: Kind, mtime: number) {
  const key = `${id}/${entry}`;
  const hit = titles.get(key);
  if (hit && hit.mtime === mtime) return hit.title;
  let title: string | undefined;
  if (kind === 'html' || kind === 'markdown') {
    title = extractTitle(kind, await readHead(join(root, id, entry)).catch(() => ''));
  }
  titles.set(key, { mtime, title });
  return title;
}

export async function readArtifact(root: string, id: string): Promise<ArtifactDetail | undefined> {
  if (!ID_RE.test(id)) return undefined;
  const tree = await walk(join(root, id)).catch(() => undefined);
  if (!tree) return undefined;
  tree.sort((a, b) => a.path.localeCompare(b.path));
  const entry = pickEntry(tree.map((f) => f.path)) ?? '';
  const entryFile = tree.find((f) => f.path === entry);
  const kind = entry ? kindOf(entry) : 'other';
  const mtimes = tree.map((f) => f.mtime);
  const dirStat = await stat(join(root, id));
  const created = mtimes.length ? Math.min(...mtimes) : Math.floor(dirStat.mtimeMs);
  const updated = mtimes.length ? Math.max(...mtimes) : created;
  const fallback = entry && entry !== 'index.html' ? entry.split('/').pop() : undefined;
  const title =
    (entryFile && (await titleFor(root, id, entry, kind, entryFile.mtime))) || fallback || id;
  return {
    id,
    title,
    entry,
    kind,
    created,
    updated,
    size: tree.reduce((n, f) => n + f.size, 0),
    files: tree.length,
    thumbnailable: THUMBNAILABLE.has(kind),
    tree,
  };
}

export async function listArtifacts(root: string): Promise<ArtifactSummary[]> {
  const ids = (await readdir(root, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && ID_RE.test(d.name))
    .map((d) => d.name);
  const all = await Promise.all(ids.map((id) => readArtifact(root, id)));
  return all
    .filter((a): a is ArtifactDetail => a !== undefined)
    .map(({ tree: _tree, ...summary }) => summary)
    .sort((a, b) => b.created - a.created);
}
