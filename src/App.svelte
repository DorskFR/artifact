<script lang="ts">
  import {
    AutoGrid,
    Callout,
    Container,
    EmptyState,
    Heading,
    IconButton,
    Input,
    SectionHeader,
    SelectButton,
    Skeleton,
    Text,
    ThemePicker,
  } from '@dorsk/tsumikit';
  import { listArtifacts } from './lib/api.ts';
  import ArtifactCard from './lib/ui/ArtifactCard.svelte';
  import ArtifactDrawer from './lib/ui/ArtifactDrawer.svelte';
  import ArtifactRow from './lib/ui/ArtifactRow.svelte';
  import {
    type ArtifactSummary,
    arrange,
    formatBytes,
    groupByDay,
    KIND_LABEL,
    type KindFilter,
    kindCounts,
    SORTS,
    type Sort,
  } from './lib/view.ts';

  type Layout = 'grid' | 'list';
  const params = new URLSearchParams(location.search);
  const stored = <T extends string>(key: string, allowed: readonly T[], dflt: T): T => {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : dflt;
  };

  let items = $state<ArtifactSummary[]>([]);
  let loaded = $state(false);
  let error = $state<string>();
  let query = $state(params.get('q') ?? '');
  let kind = $state<KindFilter>((params.get('kind') as KindFilter | null) ?? 'all');
  let sort = $state<Sort>(stored('artifact.sort', SORTS.map((s) => s.value), 'newest'));
  let layout = $state<Layout>(stored('artifact.layout', ['grid', 'list'] as const, 'grid'));
  let selectedId = $state<string | undefined>(params.get('id') ?? undefined);
  let search = $state<HTMLInputElement | null>(null);

  const visible = $derived(arrange(items, query, kind, sort));
  const groups = $derived(groupByDay(visible, sort));
  const counts = $derived(kindCounts(items));
  const total = $derived(items.reduce((n, a) => n + a.size, 0));
  const selected = $derived(items.find((a) => a.id === selectedId));
  const kindOptions = $derived([
    { value: 'all', label: `All kinds (${items.length})` },
    ...[...counts].map(([k, n]) => ({ value: k, label: `${KIND_LABEL[k]} (${n})` })),
  ]);

  async function refresh() {
    try {
      items = await listArtifacts();
      error = undefined;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loaded = true;
    }
  }

  $effect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });

  $effect(() => {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (kind !== 'all') p.set('kind', kind);
    if (selectedId) p.set('id', selectedId);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  });

  $effect(() => {
    localStorage.setItem('artifact.sort', sort);
    localStorage.setItem('artifact.layout', layout);
  });

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, [contenteditable]')) return;
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      search?.focus();
    }
  }

  const select = (id: string) => {
    selectedId = id;
  };
</script>

<svelte:window {onkeydown} />

<header class="top">
    <div class="bar">
      <Heading level={1} size="md">artifact</Heading>
      {#if loaded && !error}
        <Text size="xs" tone="muted" numeric class="total">{items.length} artifacts · {formatBytes(total)}</Text>
      {/if}
      <div class="controls">
        <Input
          bind:value={query}
          bind:el={search}
          icon="search"
          placeholder="Search titles, ids, files…  /"
          clearable
          size="sm"
          grow
          aria-label="Search artifacts"
        />
        <SelectButton label="Kind" icon="filter" value={kind} options={kindOptions} onchange={(v) => (kind = v as KindFilter)} box="sm" />
        <SelectButton label="Sort" icon="arrow-down" value={sort} options={SORTS} onchange={(v) => (sort = v as Sort)} box="sm" />
        <IconButton
          icon={layout === 'grid' ? 'list' : 'layout-grid'}
          label={layout === 'grid' ? 'List view' : 'Grid view'}
          variant="ghost"
          box="sm"
          onclick={() => (layout = layout === 'grid' ? 'list' : 'grid')}
        />
        <ThemePicker auto variant="ghost" size="sm" />
      </div>
    </div>
</header>

  <Container size="none" pad>
    {#if error}
      <Callout tone="danger" title="Could not load artifacts">{error}</Callout>
    {/if}
    {#if !loaded}
      <AutoGrid min="260px" gap="var(--sp-4)">
        {#each { length: 8 }, i (i)}
          <Skeleton height="220px" radius="var(--r-md)" />
        {/each}
      </AutoGrid>
    {:else if !visible.length}
      <EmptyState
        icon="search"
        title={items.length ? 'Nothing matches' : 'No artifacts yet'}
        description={items.length ? 'Try a different search or kind.' : 'Uploads appear here as soon as they land.'}
        actionLabel={items.length ? 'Clear filters' : undefined}
        onAction={() => {
          query = '';
          kind = 'all';
        }}
      />
    {:else}
      {#each groups as g (g.key)}
        <section class="group">
          {#if g.label}
            <SectionHeader title={g.label} count={g.items.length} sticky />
          {/if}
          {#if layout === 'grid'}
            <AutoGrid min="280px" max="360px" fill gap="var(--sp-4)">
              {#each g.items as a (a.id)}
                <ArtifactCard {a} onselect={select} />
              {/each}
            </AutoGrid>
          {:else}
            <ul class="rows">
              {#each g.items as a (a.id)}
                <ArtifactRow {a} onselect={select} />
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    {/if}
  </Container>

<ArtifactDrawer summary={selected} onclose={() => (selectedId = undefined)} />

<style>
  .top {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--bg);
    border-bottom: var(--edge-width) solid var(--surface-edge);
    padding-block: var(--sp-2);
  }
  .group :global([data-tsu='SectionHeader']) {
    top: 52px;
  }
  .bar {
    display: flex;
    padding-inline: var(--sp-3);
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    min-width: 0;
    flex-wrap: wrap;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex: 1;
    min-width: min(100%, 320px);
    justify-content: flex-end;
  }
  .controls :global([data-tsu='Input']) {
    max-width: 420px;
  }
  .group {
    margin-bottom: var(--sp-6);
  }
  .group :global([data-tsu='SectionHeader']) {
    margin-bottom: var(--sp-3);
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  @media (max-width: 640px) {
    .bar :global(.total) {
      display: none;
    }
  }
</style>
