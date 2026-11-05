# artifact

Browser for [artifact.dorsk.dev](https://artifact.dorsk.dev): a grid of every uploaded
artifact with thumbnails, titles, upload dates, sizes and file lists, built with Svelte 5 and
[Tsumikit](https://github.com/DorskFR/tsumikit).

It runs as a sidecar next to the nginx that stores artifacts. nginx keeps owning uploads
(`PUT /a/<id>/…` with the uploader client cert) and serving files; it proxies `/`, `/_ui/` and
`/_api/` here.

## API

| Route | Returns |
| --- | --- |
| `GET /_api/artifacts` | every artifact, newest first: id, title, entry file, kind, created/updated (ms), size, file count |
| `GET /_api/artifacts/:id` | the same plus the file tree |
| `GET /_api/thumbs/:id?v=<updated>` | a 640×400 thumbnail (webp, or png for PDFs); 404 when there is none |

Titles come from the entry file's `<title>`/`<h1>` or first Markdown heading. The entry is
`index.html`, else the only top-level file, else the first page/image/PDF.

Thumbnails are rendered one at a time by `chromium-headless-shell` (pages, images, Markdown,
text) or `pdftoppm` (PDFs), fetched through nginx at `ARTIFACT_ORIGIN`, and cached as
`<id>.<updated>.<ext>`, so a re-upload re-renders. Failures are cached the same way.

## Configuration

| Env | Default |
| --- | --- |
| `ARTIFACT_ROOT` | `/data/a` |
| `ARTIFACT_CACHE` | `/cache/thumbs` |
| `ARTIFACT_ORIGIN` | `http://127.0.0.1:8080` |
| `HOST` / `PORT` | `127.0.0.1` / `8081` (image: `0.0.0.0`) |
| `ARTIFACT_WARM_MS` | `60000`, the interval for pre-rendering missing thumbnails |

## Development

```sh
bun install
ARTIFACT_ROOT=./tmp/data/a ARTIFACT_CACHE=./tmp/cache ARTIFACT_ORIGIN=http://127.0.0.1:8080 bun run dev:server
bun run dev     # vite on :5173, proxies /_api to :8081 and /a to nginx on :8080
bun run check   # typecheck + lint + tests
```

Releases: bump `version` in `package.json`, tag `v<version>`; CI pushes
`ghcr.io/dorskfr/artifact:<version>`.
