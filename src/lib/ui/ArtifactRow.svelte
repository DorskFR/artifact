<script lang="ts">
  import { Artwork, Badge, IconButton, Text, Timestamp } from '@dorsk/tsumikit';
  import {
    type ArtifactSummary,
    entryUrl,
    formatBytes,
    KIND_ICON,
    KIND_LABEL,
    thumbUrl,
  } from '../view.ts';

  let { a, onselect }: { a: ArtifactSummary; onselect: (id: string) => void } = $props();
</script>

<li class="row">
  <a class="thumb" href={entryUrl(a)} target="_blank" rel="noopener" tabindex="-1">
    <Artwork
      src={a.thumbnailable ? thumbUrl(a) : null}
      alt=""
      aspect="16/10"
      size="96px"
      radius="sm"
      fallback="icon"
      icon={KIND_ICON[a.kind]}
    />
  </a>
  <div class="main">
    <a class="title" href={entryUrl(a)} target="_blank" rel="noopener" title={a.title}>{a.title}</a>
    <Text size="xs" tone="faint" mono truncate>{a.id}</Text>
  </div>
  <span class="kind"><Badge size="xs" icon={KIND_ICON[a.kind]}>{KIND_LABEL[a.kind]}</Badge></span>
  <Text size="sm" tone="muted" class="when"><Timestamp value={a.created} mode="datetime" details /></Text>
  <Text size="sm" tone="faint" numeric class="size">{formatBytes(a.size)}</Text>
  <IconButton icon="info" label="Details" box="sm" variant="ghost" onclick={() => onselect(a.id)} />
</li>

<style>
  .row {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr) auto auto 5rem auto;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-2);
    border-bottom: var(--edge-width) solid var(--surface-edge);
  }
  .row:hover {
    background: var(--surface-fill);
  }
  .thumb :global(.img) {
    object-position: top center;
  }
  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }
  .title {
    color: var(--text);
    font-weight: 600;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title:hover {
    color: var(--accent);
  }
  .row :global(.size) {
    text-align: right;
  }
  @media (max-width: 720px) {
    .row {
      grid-template-columns: 72px minmax(0, 1fr) auto;
    }
    .row :global(.when),
    .row :global(.size),
    .kind {
      display: none;
    }
  }
</style>
