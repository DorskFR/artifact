<script lang="ts">
  import { Artwork, Badge, Card, IconButton, Text, Timestamp } from '@dorsk/tsumikit';
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

<Card as="section" padding="none" overflow="hidden" class="art-card">
  <a class="thumb" href={entryUrl(a)} target="_blank" rel="noopener" tabindex="-1">
    <Artwork
      src={a.thumbnailable ? thumbUrl(a) : null}
      alt=""
      aspect="16/10"
      radius="sm"
      fallback="icon"
      icon={KIND_ICON[a.kind]}
      hover
    />
  </a>
  <div class="body">
    <div class="head">
      <a class="title" href={entryUrl(a)} target="_blank" rel="noopener" title={a.title}>{a.title}</a>
      <IconButton icon="info" label="Details" box="sm" variant="ghost" onclick={() => onselect(a.id)} />
    </div>
    <div class="meta">
      <Badge size="xs" icon={KIND_ICON[a.kind]}>{KIND_LABEL[a.kind]}</Badge>
      <Text size="xs" tone="muted"><Timestamp value={a.created} mode="relative" details /></Text>
      <Text size="xs" tone="faint" numeric>{formatBytes(a.size)} · {a.files} {a.files === 1 ? 'file' : 'files'}</Text>
    </div>
  </div>
</Card>

<style>
  :global(.art-card) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .thumb {
    display: block;
    padding: var(--sp-2) var(--sp-2) 0;
  }
  .thumb :global(.img) {
    object-position: top center;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3) var(--sp-3);
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-1);
  }
  .title {
    flex: 1;
    min-width: 0;
    color: var(--text);
    font-weight: 600;
    line-height: 1.3;
    text-decoration: none;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .title:hover {
    color: var(--accent);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-2);
  }
</style>
