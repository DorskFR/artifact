import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { ID_RE, listArtifacts, readArtifact } from './index.ts';
import { Thumbnailer } from './thumbs.ts';
import type { ArtifactSummary } from './types.ts';

const env = process.env;
const ROOT = env.ARTIFACT_ROOT ?? '/data/a';
const DIST = resolve(env.ARTIFACT_DIST ?? 'dist');
const PORT = Number(env.PORT ?? 8081);
const HOST = env.HOST ?? '127.0.0.1';
const WARM_MS = Number(env.ARTIFACT_WARM_MS ?? 60_000);

const thumbs = new Thumbnailer({
  root: ROOT,
  cacheDir: env.ARTIFACT_CACHE ?? '/cache/thumbs',
  origin: env.ARTIFACT_ORIGIN ?? 'http://127.0.0.1:8080',
  chromium: env.CHROMIUM ?? '/usr/bin/chromium-headless-shell',
  pdftoppm: env.PDFTOPPM ?? '/usr/bin/pdftoppm',
});

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

let listing: { at: number; items: Promise<ArtifactSummary[]> } | undefined;

function artifacts(): Promise<ArtifactSummary[]> {
  if (!listing || Date.now() - listing.at > 3000) {
    const items = listArtifacts(ROOT);
    listing = { at: Date.now(), items };
    items.catch(() => {
      listing = undefined;
    });
  }
  return listing.items;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function sendFile(res: ServerResponse, path: string, cache: string) {
  const st = await stat(path).catch(() => undefined);
  if (!st?.isFile()) return false;
  res.writeHead(200, {
    'content-type': MIME[extname(path)] ?? 'application/octet-stream',
    'content-length': st.size,
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
  });
  createReadStream(path).pipe(res);
  return true;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' });

  if (path === '/healthz') return json(res, 200, { ok: true });

  if (path === '/_api/artifacts') return json(res, 200, await artifacts());

  const detail = /^\/_api\/artifacts\/([^/]+)$/.exec(path)?.[1];
  if (detail) {
    const a = await readArtifact(ROOT, detail);
    return a ? json(res, 200, a) : json(res, 404, { error: 'not found' });
  }

  const thumbId = /^\/_api\/thumbs\/([^/]+)$/.exec(path)?.[1];
  if (thumbId) {
    if (!ID_RE.test(thumbId)) return json(res, 404, { error: 'not found' });
    const a =
      (await artifacts()).find((x) => x.id === thumbId) ?? (await readArtifact(ROOT, thumbId));
    const file = a && (await thumbs.get(a));
    if (!file) return json(res, 404, { error: 'no thumbnail' });
    const versioned = url.searchParams.get('v') === String(a.updated);
    await sendFile(res, file, versioned ? 'public, max-age=31536000, immutable' : 'no-cache');
    return;
  }

  if (path.startsWith('/_ui/')) {
    const file = normalize(join(DIST, path));
    if (
      file.startsWith(`${DIST}/`) &&
      (await sendFile(res, file, 'public, max-age=31536000, immutable'))
    )
      return;
    return json(res, 404, { error: 'not found' });
  }

  if (path === '/' || path === '/index.html') {
    if (await sendFile(res, join(DIST, 'index.html'), 'no-cache')) return;
  }
  return json(res, 404, { error: 'not found' });
}

async function warm() {
  try {
    for (const a of await artifacts()) await thumbs.get(a);
  } catch (err) {
    console.error('warm failed:', err instanceof Error ? err.message : err);
  }
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'internal' });
    else res.destroy();
  });
}).listen(PORT, HOST, () => {
  console.log(`artifact ui on http://${HOST}:${PORT} (root ${ROOT})`);
  void warm();
  if (WARM_MS > 0) setInterval(() => void warm(), WARM_MS).unref();
});
