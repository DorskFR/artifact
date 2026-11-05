<script lang="ts">
  import {
    Artwork,
    Badge,
    Button,
    CopyButton,
    Drawer,
    Spinner,
    Stack,
    Text,
    Timestamp,
  } from '@dorsk/tsumikit';
  import { getArtifact } from '../api.ts';
  import {
    type ArtifactDetail,
    type ArtifactSummary,
    entryUrl,
    fileUrl,
    formatBytes,
    KIND_ICON,
    KIND_LABEL,
    thumbUrl,
  } from '../view.ts';

  let { summary, onclose }: { summary: ArtifactSummary | undefined; onclose: () => void } =
    $props();

  let detail = $state<ArtifactDetail>();
  let failed = $state(false);

  $effect(() => {
    const id = summary?.id;
    detail = undefined;
    failed = false;
    if (!id) return;
    let live = true;
    getArtifact(id).then(
      (d) => {
        if (live) detail = d;
      },
      () => {
        if (live) failed = true;
      },
    );
    return () => {
      live = false;
    };
  });

  const link = $derived(summary ? new URL(entryUrl(summary), location.origin).href : '');
</script>

<Drawer open={!!summary} title={summary?.title ?? ''} icon={summary ? KIND_ICON[summary.kind] : undefined} width="min(560px, 100vw)" {onclose}>
  {#if summary}
    <Stack gap="var(--sp-4)">
      <a href={entryUrl(summary)} target="_blank" rel="noopener" class="preview">
        <Artwork
          src={summary.thumbnailable ? thumbUrl(summary) : null}
          alt={summary.title}
          aspect="16/10"
          radius="md"
          fallback="icon"
          icon={KIND_ICON[summary.kind]}
        />
      </a>
      <div class="actions">
        <Button variant="primary" as="a" href={entryUrl(summary)} target="_blank" rel="noopener">Open</Button>
        <CopyButton text={link} label="Copy link" showLabel />
      </div>
      <dl class="facts">
        <dt>Kind</dt>
        <dd><Badge size="sm" icon={KIND_ICON[summary.kind]}>{KIND_LABEL[summary.kind]}</Badge></dd>
        <dt>Uploaded</dt>
        <dd><Timestamp value={summary.created} mode="datetime" details /></dd>
        {#if summary.updated - summary.created > 60_000}
          <dt>Updated</dt>
          <dd><Timestamp value={summary.updated} mode="datetime" details /></dd>
        {/if}
        <dt>Size</dt>
        <dd>{formatBytes(summary.size)} in {summary.files} {summary.files === 1 ? 'file' : 'files'}</dd>
        <dt>Id</dt>
        <dd><Text mono size="sm">{summary.id}</Text></dd>
      </dl>
      <section>
        <Text variant="eyebrow" tone="muted">Files</Text>
        {#if failed}
          <Text tone="danger" size="sm">Could not load the file list.</Text>
        {:else if !detail}
          <Spinner />
        {:else}
          <ul class="files">
            {#each detail.tree as f (f.path)}
              <li>
                <a href={fileUrl(summary.id, f.path)} target="_blank" rel="noopener" class:entry={f.path === summary.entry}>{f.path}</a>
                <Text size="xs" tone="faint" numeric>{formatBytes(f.size)}</Text>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </Stack>
  {/if}
</Drawer>

<style>
  .preview {
    display: block;
  }
  .preview :global(.img) {
    object-position: top center;
  }
  .actions {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }
  .facts {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
  }
  .facts dt {
    color: var(--text-muted);
    font-size: var(--fs-sm);
  }
  .facts dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .files {
    list-style: none;
    margin: var(--sp-2) 0 0;
    padding: 0;
    max-height: 40vh;
    overflow: auto;
  }
  .files li {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: 4px 0;
    border-bottom: var(--edge-width) solid var(--surface-edge);
  }
  .files a {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--text);
    overflow-wrap: anywhere;
  }
  .files a.entry {
    color: var(--accent);
    font-weight: 600;
  }
</style>
