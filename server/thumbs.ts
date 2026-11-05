import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ArtifactSummary } from './types.ts';

export type Runner = (cmd: string, args: string[], timeoutMs: number) => Promise<void>;

export interface ThumbConfig {
  root: string;
  cacheDir: string;
  origin: string;
  chromium: string;
  pdftoppm: string;
  timeoutMs?: number;
  retryMs?: number;
  run?: Runner;
}

export const runProcess: Runner = (cmd, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, HOME: tmpdir() },
    });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-2000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code ?? signal}: ${stderr.trim()}`));
    });
  });

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export function imagePage(src: string): string {
  return `<!doctype html><html><body style="margin:0;background:#16181d;display:grid;place-items:center;height:100vh"><img src="${escapeHtml(src)}" style="max-width:100vw;max-height:100vh;object-fit:contain"></body></html>`;
}

export function textPage(name: string, text: string): string {
  return `<!doctype html><html><body style="margin:0;padding:48px 56px;background:#fbfaf7;color:#1d1f24;font:22px/1.5 'DejaVu Sans Mono',monospace"><div style="font:600 18px sans-serif;color:#8a8f98;margin-bottom:24px">${escapeHtml(name)}</div><pre style="margin:0;white-space:pre-wrap;word-break:break-word">${escapeHtml(text)}</pre></body></html>`;
}

export class Thumbnailer {
  readonly #cfg: Required<ThumbConfig>;
  #chain: Promise<unknown> = Promise.resolve();
  readonly #inflight = new Map<string, Promise<string | undefined>>();

  constructor(cfg: ThumbConfig) {
    this.#cfg = {
      ...cfg,
      timeoutMs: cfg.timeoutMs ?? 30_000,
      retryMs: cfg.retryMs ?? 3_600_000,
      run: cfg.run ?? runProcess,
    };
  }

  async cached(a: ArtifactSummary): Promise<string | undefined> {
    for (const ext of ['webp', 'png']) {
      const p = join(this.#cfg.cacheDir, `${a.id}.${a.updated}.${ext}`);
      if (await exists(p)) return p;
    }
    return undefined;
  }

  async failed(a: ArtifactSummary): Promise<boolean> {
    const st = await stat(join(this.#cfg.cacheDir, `${a.id}.${a.updated}.fail`)).catch(
      () => undefined,
    );
    return !!st && Date.now() - st.mtimeMs < this.#cfg.retryMs;
  }

  get(a: ArtifactSummary): Promise<string | undefined> {
    if (!a.thumbnailable) return Promise.resolve(undefined);
    const key = `${a.id}.${a.updated}`;
    const pending = this.#inflight.get(key);
    if (pending) return pending;
    const job = this.#resolve(a).finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, job);
    return job;
  }

  async #resolve(a: ArtifactSummary): Promise<string | undefined> {
    const hit = await this.cached(a);
    if (hit) return hit;
    if (await this.failed(a)) return undefined;
    const run = this.#chain.then(() => this.#render(a));
    this.#chain = run.catch(() => undefined);
    return run;
  }

  async #render(a: ArtifactSummary): Promise<string | undefined> {
    const { cacheDir, root, origin, chromium, pdftoppm, timeoutMs, run } = this.#cfg;
    await mkdir(cacheDir, { recursive: true });
    const work = await mkdtemp(join(tmpdir(), 'thumb-'));
    const key = `${a.id}.${a.updated}`;
    try {
      let out: string;
      if (a.kind === 'pdf') {
        const prefix = join(work, 'page');
        await run(
          pdftoppm,
          [
            '-png',
            '-f',
            '1',
            '-l',
            '1',
            '-singlefile',
            '-scale-to',
            '640',
            join(root, a.id, a.entry),
            prefix,
          ],
          timeoutMs,
        );
        out = `${prefix}.png`;
      } else {
        const url = `${origin}/a/${a.id}/${encodePath(a.entry)}`;
        let target = url;
        if (a.kind === 'image' || a.kind === 'markdown' || a.kind === 'text') {
          const page =
            a.kind === 'image'
              ? imagePage(url)
              : textPage(a.entry, await readSnippet(join(root, a.id, a.entry)));
          target = `file://${join(work, 'page.html')}`;
          await writeFile(join(work, 'page.html'), page);
        }
        out = join(work, 'shot.webp');
        await run(chromium, chromiumArgs(work, out, target), timeoutMs);
      }
      const ext = out.endsWith('.png') ? 'png' : 'webp';
      const dest = join(cacheDir, `${key}.${ext}`);
      await copyFile(out, `${dest}.part`);
      await rename(`${dest}.part`, dest);
      await this.#prune(a.id, `${key}.${ext}`);
      return dest;
    } catch (err) {
      console.error(`thumbnail ${a.id} failed:`, err instanceof Error ? err.message : err);
      await writeFile(join(cacheDir, `${key}.fail`), String(err));
      await this.#prune(a.id, `${key}.fail`);
      return undefined;
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  async #prune(id: string, keep: string) {
    for (const f of await readdir(this.#cfg.cacheDir)) {
      if (f.startsWith(`${id}.`) && f !== keep)
        await rm(join(this.#cfg.cacheDir, f), { force: true });
    }
  }
}

export function chromiumArgs(work: string, out: string, url: string): string[] {
  return [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--no-first-run',
    '--hide-scrollbars',
    '--mute-audio',
    '--allow-file-access-from-files',
    `--user-data-dir=${join(work, 'profile')}`,
    '--window-size=1280,800',
    '--force-device-scale-factor=0.5',
    '--virtual-time-budget=5000',
    `--screenshot=${out}`,
    url,
  ];
}

async function readSnippet(path: string): Promise<string> {
  const fh = await open(path, 'r');
  const buf = Buffer.alloc(2400);
  const { bytesRead } = await fh.read(buf, 0, buf.length, 0).finally(() => fh.close());
  const text = buf.subarray(0, bytesRead).toString('utf8');
  return text.split('\n').slice(0, 40).join('\n');
}

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}
