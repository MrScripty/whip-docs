<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { TauriArchitectureBackend } from '../../backends/TauriArchitectureBackend';
  import type { GraphNodeDto, GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';
  import { NativeIntentBackend } from './NativeIntentBackend';
  import { PreviewIntentBackend } from './PreviewIntentBackend';
  import { previewGraph, PREVIEW_UPSTREAM } from './previewFixture';
  import { IntentGraphScene } from '../intent-graph/IntentGraphScene';
  import type { IntentBackend, IntentKind, IntentRecord } from './types';

  const native = new TauriArchitectureBackend();
  const nativeAvailable = native.isAvailable();
  const preview = !nativeAvailable && new URLSearchParams(window.location.search).get('preview') === '1';
  let intentBackend: IntentBackend = new NativeIntentBackend();
  let scene: IntentGraphScene | undefined;
  let mount: HTMLDivElement;
  let graph = $state<GraphSnapshotDto | null>(null);
  let records = $state<IntentRecord[]>([]);
  let selectedId = $state<string | null>(null);
  const expanded = new SvelteSet<string>();
  let sourcePath = $state('');
  let error = $state('');
  let notice = $state('');
  let busy = $state(false);
  let saving = $state(false);
  let kind = $state<IntentKind>('original');
  let parentId = $state('');
  let text = $state('');
  let showHistory = $state(false);
  let filter = $state('');
  const drafts = new SvelteMap<string, { text: string; kind: IntentKind; parentId: string }>();
  const files = $derived(graph?.nodes.filter(node => node.kind === 'file' && (node.sourceRange?.path ?? node.label).toLowerCase().includes(filter.toLowerCase())) ?? []);
  const selected = $derived(graph?.nodes.find(node => node.id === selectedId) ?? null);
  const symbolSelected = $derived(selected && !['file', 'workspace', 'crate'].includes(selected.kind));
  const selectedRecords = $derived(records.filter(record => showHistory || record.symbol.nodeId === selectedId));
  const originals = $derived(records.filter(record => record.kind === 'original' && record.symbol.nodeId === selectedId && record.bindingStatus === 'current'));
  const relations = $derived(graph?.edges.filter(edge => edge.sourceId === selectedId || edge.targetId === selectedId) ?? []);

  $effect(() => { if (graph && scene) scene.update(graph, expanded, selectedId); });

  onMount(() => {
    try { scene = new IntentGraphScene(mount, selectNode); } catch (cause) { error = `3D view unavailable: ${message(cause)}. Use the symbol list to continue.`; }
    void initialize();
    return () => scene?.dispose();
  });

  function message(cause: unknown): string { return cause instanceof Error ? cause.message : typeof cause === 'object' && cause !== null && 'message' in cause ? String(cause.message) : String(cause); }

  async function initialize() {
    busy = true;
    try {
      if (preview) {
        const { default: source } = await import('../../../fixtures/intent-preview/source.rs?raw');
        intentBackend = new PreviewIntentBackend(localStorage, previewGraph, source);
        graph = structuredClone(previewGraph);
      } else if (nativeAvailable) {
        const config = await native.getAppConfig();
        sourcePath = config.sourceRepoPath ?? '';
        graph = await native.getGraphSnapshot();
      }
      if (preview || nativeAvailable) records = await intentBackend.listRecords();
      scene?.update(graph ?? { schemaVersion: 1, sourceRoot: '', generatedAt: '', nodes: [], edges: [], diagnostics: [] }, expanded, selectedId);
    } catch (cause) { error = message(cause); } finally { busy = false; }
  }

  async function analyze() {
    if (busy || !sourcePath.trim()) return;
    busy = true; error = ''; notice = ''; drafts.clear(); selectedId = null; text = ''; expanded.clear(); records = []; graph = null;
    try {
      await native.setSourceRepoPath(sourcePath);
      graph = await native.analyzeSourceRepo();
      records = await intentBackend.listRecords();
      notice = 'Analysis loaded. Expand a file to inspect its symbols.';
    } catch (cause) { error = message(cause); } finally { busy = false; }
  }

  function selectNode(id: string) {
    if (id === selectedId || saving) return;
    if (selectedId) drafts.set(selectedId, { text, kind, parentId });
    selectedId = id;
    const draft = drafts.get(id);
    kind = draft?.kind ?? 'original'; parentId = draft?.parentId ?? ''; text = draft?.text ?? ''; notice = '';
  }
  function toggleFile(file: GraphNodeDto) {
    if (expanded.has(file.id)) { expanded.delete(file.id); if (selected?.sourceRange?.path === file.sourceRange?.path) selectNode(file.id); }
    else { expanded.add(file.id); selectNode(file.id); }
  }
  function symbolsFor(file: GraphNodeDto) { return graph?.nodes.filter(node => node.kind !== 'file' && node.sourceRange?.path === file.sourceRange?.path) ?? []; }
  async function refreshRecords() { try { error = ''; records = await intentBackend.listRecords(); notice = 'Journal reloaded.'; } catch (cause) { error = message(cause); } }
  async function saveIntent() {
    if (!graph || !selectedId || saving || !text.trim()) return;
    const input = { nodeId: selectedId, text, kind, parentId: kind === 'original' ? null : parentId, expectedAnalysisAt: graph.generatedAt };
    saving = true; error = ''; notice = '';
    try {
      await intentBackend.appendRecord(input);
      records = await intentBackend.listRecords();
      if (selectedId === input.nodeId) text = '';
      drafts.delete(input.nodeId);
      notice = `${input.kind === 'original' ? 'Original intent' : input.kind === 'proposal' ? 'Proposal' : 'Interpretation'} saved as a new journal entry.`;
    } catch (cause) { error = message(cause); } finally { saving = false; }
  }
  function label(id: string) { return graph?.nodes.find(node => node.id === id)?.label ?? 'Unresolved symbol'; }
  function when(value: string) { const date = new Date(/^\d+$/.test(value) ? Number(value) : value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }
</script>

<div class="intent-app">
  <header class="topbar">
    <div class="brand"><span class="brand-icon">W</span><div><strong>WHIP DOCS</strong><span>Intent, in context</span></div></div>
    <div class="top-meta"><span class="mode-dot"></span>{preview ? 'FIXTURE PREVIEW' : nativeAvailable ? 'LOCAL WORKSPACE' : 'DESKTOP REQUIRED'}<span class="version">PROTOTYPE · 01</span></div>
  </header>

  {#if preview}
    <div class="preview-banner"><strong>Browser fixture</strong> Curated symbols from public Whip Docs @{PREVIEW_UPSTREAM.slice(0, 7)}. Native analysis and disk persistence are not running here. Preview entries stay in this browser.</div>
  {:else if !nativeAvailable}
    <div class="preview-banner"><strong>Open the Tauri desktop app to analyze a local Rust repository.</strong> <a href="?preview=1">Open the clearly labelled browser fixture</a></div>
  {/if}

  {#if nativeAvailable}
    <form class="repo-bar" onsubmit={(event) => { event.preventDefault(); void analyze(); }}>
      <label for="source-root">Rust repository</label><input id="source-root" placeholder="Absolute path to a local Cargo workspace" bind:value={sourcePath} disabled={busy || saving} /><button class="primary" disabled={busy || saving || !sourcePath.trim()}>{busy ? 'Analyzing…' : 'Open and analyze'}</button>
    </form>
  {/if}

  <main class="workspace">
    <aside class="navigator">
      <div class="section-heading"><span>REPOSITORY</span><span>{graph?.nodes.filter(n => n.kind === 'file').length ?? 0} FILES</span></div>
      <h1>{preview ? 'whip-docs' : graph?.sourceRoot.split(/[\\/]/).pop() ?? 'Open a workspace'}</h1>
      <p class="muted small">Expand a file. Select a symbol. Preserve why it exists.</p>
      <input class="search" aria-label="Find a file" placeholder="Find a file…" bind:value={filter} />
      <div class="file-list">
        {#each files as file (file.id)}
          <div class="file-row"><button class="expand" aria-label={`${expanded.has(file.id) ? 'Collapse' : 'Expand'} ${file.sourceRange?.path ?? file.label}`} aria-expanded={expanded.has(file.id)} onclick={() => toggleFile(file)}>{expanded.has(file.id) ? '−' : '+'}</button><button class:selected={selectedId === file.id} class="file-name" onclick={() => selectNode(file.id)} title={file.sourceRange?.path ?? file.label}>{(file.sourceRange?.path ?? file.label).split('/').pop()}</button></div>
          {#if expanded.has(file.id)}
            <div class="symbol-list">{#each symbolsFor(file) as symbol (symbol.id)}<button class:selected={selectedId === symbol.id} onclick={() => selectNode(symbol.id)}><span class="kind-dot" data-kind={symbol.kind}></span><span>{symbol.label}</span><small>{symbol.kind.replaceAll('_', ' ')}</small></button>{/each}</div>
          {/if}
        {/each}
      </div>
      <div class="nav-bottom"><span class="eyebrow">EVIDENCE BOUNDARY</span><p>Syntax-derived symbols. Source locations are approximate; calls may be partial. Missing edges do not prove missing relationships.</p></div>
    </aside>

    <section class="graph-area" aria-label="3D symbol graph">
      <div class="graph-title"><span class="eyebrow">OBSERVED STRUCTURE</span><h2>Explore the shape of your code.</h2><p>Drag to orbit · Scroll to zoom · Click to inspect</p></div>
      <div class="graph-mount" bind:this={mount}></div>
      {#if !graph && !busy}<div class="graph-empty">Choose a local Rust repository to begin.</div>{/if}
      {#if busy}<div class="graph-empty">Loading workspace…</div>{/if}
      <div class="graph-legend"><span><i class="legend-file"></i>File</span><span><i class="legend-type"></i>Type</span><span><i class="legend-callable"></i>Callable</span><span class="legend-line">━━ Structural</span><span class="legend-line">┄┄ Uncertain</span></div>
      <div class="graph-note">Intent and proposals are annotations. They do not change the observed graph.</div>
    </section>

    <aside class="inspector">
      <div class="section-heading"><span>INSPECTOR</span><span>{selected?.kind.replaceAll('_', ' ') ?? 'NO SELECTION'}</span></div>
      {#if selected}
        <h2 class="symbol-title">{selected.label.split('/').pop()}</h2>
        <p class="source-path">{selected.sourceRange?.path}</p>
        <div class="metadata"><span>Source location</span><strong>~ line {selected.sourceRange?.startLine ?? 'unknown'}</strong><span>Range precision</span><strong>Unverified</strong><span>Graph facts</span><strong>{relations.length} relationships</strong></div>
        {#if selected.kind === 'file'}<button class="outline wide" onclick={() => toggleFile(selected)}>{expanded.has(selected.id) ? 'Collapse symbols' : 'Expand symbols'} · {symbolsFor(selected).length}</button>{/if}
        {#if symbolSelected}
          <div class="intent-composer">
            <span class="eyebrow">CAPTURE THE WHY</span>
            <h3>What should this symbol mean?</h3>
            <label for="intent-kind">Record type</label><select id="intent-kind" bind:value={kind} onchange={() => { parentId = originals[0]?.id ?? ''; }} disabled={saving}><option value="original">Original intent</option><option value="interpretation">Later interpretation</option><option value="proposal">Proposed change</option></select>
            {#if kind !== 'original'}<label for="original-intent">Based on original intent</label><select id="original-intent" bind:value={parentId} disabled={saving}><option value="">Choose an original</option>{#each originals as original (original.id)}<option value={original.id}>{original.text.slice(0, 72)}</option>{/each}</select>{/if}
            <label for="intent-text">{kind === 'original' ? 'Your exact words, preserved' : kind === 'proposal' ? 'A proposal, not an observed fact' : 'A separate reading of the original'}</label>
            <textarea id="intent-text" rows="4" maxlength="16384" placeholder="Describe the responsibility, constraint, or reason…" bind:value={text} disabled={saving}></textarea>
            <button class="primary wide" disabled={saving || !text.trim() || (kind !== 'original' && !parentId)} onclick={() => void saveIntent()}>{saving ? 'Saving…' : kind === 'original' ? 'Preserve original intent' : 'Append separate entry'}</button>
            <p class="fine">Append-only · 16 KiB limit. Saves your words, source digests and structural metadata. Code bodies and comments are not copied. Historical structure cannot reconstruct source code.</p>
          </div>
        {/if}
      {:else}<h2>Select a symbol</h2><p class="muted">Expand a file in the navigator or the graph, then choose a symbol to record its intent.</p>{/if}
      <div class="journal-heading"><h3>Intent journal <span>{selectedRecords.length}</span></h3><button class="text-button" disabled={saving || busy || (!preview && !nativeAvailable)} onclick={() => void refreshRecords()}>Reload</button></div>
      <label class="history-toggle"><input type="checkbox" bind:checked={showHistory} />Show all repository history</label>
      {#each selectedRecords as record (record.id)}
        <article class="intent-record" data-kind={record.kind}>
          <div class="record-heading"><strong>{record.kind === 'original' ? 'ORIGINAL INTENT' : record.kind === 'proposal' ? 'PROPOSED CHANGE' : 'LATER INTERPRETATION'}</strong><span>{record.bindingStatus}</span></div>
          {#if showHistory}<small>{record.symbol.label}</small>{/if}
          <p>{record.text}</p>
          {#if record.parentId}<small>Original: {record.originalId.slice(0, 20)}…</small>{/if}
          <details class="retained-structure"><summary>Retained structural context</summary>
            <p class="fine">Analysis-time metadata, with approximate ranges. This cannot reconstruct source code.</p>
            {#each record.snapshot.structuralSnapshot.nodes as node (node.id)}<p><strong>{node.label}</strong> · {node.kind.replaceAll('_', ' ')}<br /><small>{node.sourceRange?.path} · ~ line {node.sourceRange?.startLine}</small></p>{/each}
            {#each record.snapshot.structuralSnapshot.edges as edge (edge.id)}<p><strong>{edge.kind.replaceAll('_', ' ')}</strong><br /><small>{record.snapshot.structuralSnapshot.nodes.find(node => node.id === edge.sourceId)?.label ?? edge.sourceId} → {record.snapshot.structuralSnapshot.nodes.find(node => node.id === edge.targetId)?.label ?? edge.targetId}<br />{edge.provenance} · {edge.confidence}</small></p>{/each}
          </details>
          <footer>{when(record.createdAt)}<br />{record.snapshot.byteLength.toLocaleString()} source bytes · {record.snapshot.contentHash}<br />Structure: {record.snapshot.structuralSnapshot.nodes.length} nodes · {record.snapshot.structuralSnapshot.edges.length} edges<br />Revision: {record.snapshot.repositoryRevision?.slice(0, 12) ?? 'unavailable'} · worktree may differ<br />Captured Rust source set: {record.snapshot.worktreeDigest.slice(0, 23)}…</footer>
        </article>
      {:else}<p class="empty-journal">No intent recorded here yet.</p>{/each}
      {#if selected && relations.length}<details class="relations"><summary>Observed relationship metadata</summary>{#each relations as edge (edge.id)}<p><strong>{edge.kind.replaceAll('_', ' ')}</strong><br />{label(edge.sourceId)} → {label(edge.targetId)}<br /><small>{edge.provenance} · {edge.confidence}</small></p>{/each}</details>{/if}
      {#if graph?.diagnostics.length}<details class="diagnostics"><summary>Analysis limits · {graph.diagnostics.length}</summary>{#each graph.diagnostics as diagnostic, index (index)}<p>{diagnostic.message}</p>{/each}</details>{/if}
    </aside>
  </main>
  <footer class="statusbar" aria-live="polite"><span class:error={Boolean(error)}>{error || notice || 'Read structure. Preserve intent. Keep interpretations separate.'}</span><span>{preview ? 'BROWSER STORAGE' : 'LOCAL JOURNAL'} · {records.length} ENTRIES</span></footer>
</div>
