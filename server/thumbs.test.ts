import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Runner, Thumbnailer, textPage } from './thumbs.ts';
import type { ArtifactSummary } from './types.ts';

const ID = 'c'.repeat(32);
let dir: string;
let calls: { cmd: string; args: string[] }[];

const summary = (over: Partial<ArtifactSummary> = {}): ArtifactSummary => ({
  id: ID,
  title: 't',
  entry: 'index.html',
  kind: 'html',
  created: 1,
  updated: 10,
  size: 1,
  files: 1,
  thumbnailable: true,
  ...over,
});

const fakeRun =
  (fail = false): Runner =>
  async (cmd, args) => {
    calls.push({ cmd, args });
    if (fail) throw new Error('boom');
    const shot = args.find((a) => a.startsWith('--screenshot='))?.slice('--screenshot='.length);
    const out = shot ?? `${args.at(-1)}.png`;
    await writeFile(out, 'img');
  };

const make = (run: Runner, retryMs?: number) =>
  new Thumbnailer({
    retryMs,
    root: join(dir, 'a'),
    cacheDir: join(dir, 'cache'),
    origin: 'http://nginx:8080',
    chromium: 'chromium',
    pdftoppm: 'pdftoppm',
    run,
  });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'thumbs-'));
  await mkdir(join(dir, 'a', ID), { recursive: true });
  calls = [];
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('Thumbnailer', () => {
  it('screenshots html through the origin and caches the result', async () => {
    const t = make(fakeRun());
    const [p1, p2] = await Promise.all([t.get(summary()), t.get(summary())]);
    expect(p1).toBe(join(dir, 'cache', `${ID}.10.webp`));
    expect(p2).toBe(p1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args.at(-1)).toBe(`http://nginx:8080/a/${ID}/index.html`);
    await t.get(summary());
    expect(calls).toHaveLength(1);
  });

  it('encodes entry paths', async () => {
    await make(fakeRun()).get(summary({ entry: 'my report#1.html' }));
    expect(calls[0]?.args.at(-1)).toBe(`http://nginx:8080/a/${ID}/my%20report%231.html`);
  });

  it('renders pdfs with pdftoppm', async () => {
    const p = await make(fakeRun()).get(summary({ kind: 'pdf', entry: 'doc.pdf' }));
    expect(calls[0]?.cmd).toBe('pdftoppm');
    expect(calls[0]?.args).toContain(join(dir, 'a', ID, 'doc.pdf'));
    expect(p).toBe(join(dir, 'cache', `${ID}.10.png`));
  });

  it('wraps text in a local page', async () => {
    await writeFile(join(dir, 'a', ID, 'notes.md'), '# hi');
    await make(fakeRun()).get(summary({ kind: 'markdown', entry: 'notes.md' }));
    expect(calls[0]?.args.at(-1)).toMatch(/^file:\/\/.*page\.html$/);
  });

  it('skips kinds it cannot render', async () => {
    expect(
      await make(fakeRun()).get(summary({ kind: 'audio', thumbnailable: false })),
    ).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('remembers failures per version and drops stale files', async () => {
    const t = make(fakeRun(true));
    expect(await t.get(summary())).toBeUndefined();
    expect(await t.get(summary())).toBeUndefined();
    expect(calls).toHaveLength(1);
    const ok = make(fakeRun());
    expect(await ok.get(summary({ updated: 11 }))).toBeDefined();
    expect(await readdir(join(dir, 'cache'))).toEqual([`${ID}.11.webp`]);
  });
});

describe('retries', () => {
  it('retries a failure once the marker expires', async () => {
    expect(await make(fakeRun(true)).get(summary())).toBeUndefined();
    expect(await make(fakeRun(), 0).get(summary())).toBe(join(dir, 'cache', `${ID}.10.webp`));
    expect(await readdir(join(dir, 'cache'))).toEqual([`${ID}.10.webp`]);
  });
});

describe('textPage', () => {
  it('escapes content', () => {
    expect(textPage('a<b', '<script>')).toContain('&lt;script&gt;');
  });
});
