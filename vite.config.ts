import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { themePrepaint } from './node_modules/@dorsk/tsumikit/dist/theme-mode.js';

const prepaint = (): Plugin => ({
  name: 'artifact-theme-prepaint',
  transformIndexHtml: () => [
    { tag: 'script', children: themePrepaint('tsumikit-theme', []), injectTo: 'head' },
  ],
});

export default defineConfig({
  plugins: [svelte(), prepaint()],
  build: { assetsDir: '_ui' },
  server: { proxy: { '/_api': 'http://127.0.0.1:8081', '/a/': 'http://127.0.0.1:8080' } },
  test: { environment: 'node', include: ['server/**/*.test.ts', 'src/**/*.test.ts'] },
});
