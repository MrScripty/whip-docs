<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { TauriArchitectureBackend } from '../../backends/TauriArchitectureBackend';
  import type { FileRelationGraphSnapshotDto, GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';
  import { NativeIntentBackend } from './NativeIntentBackend';
  import { PreviewIntentBackend } from './PreviewIntentBackend';
  import { SyntaxPreviewIntentBackend } from './SyntaxPreviewIntentBackend';
  import type { SourceAnalysisDto, SyntaxDialect } from '../../backends/SyntaxAnalysis';
  import { coverageLabel, dialectChoices, QUALIFICATION_GAPS, validateGraphAnalysis, restoredDialectOverrides } from './syntaxSupport';
  import { fixtureFiles, fixtureSymbols, fixtureSources } from './fileWorkspaceFixture';
  import { WorkspaceLoader } from './workspaceLoading';
  import { DirectoryGraphScene } from '../graph-v0/ThreeDirectoryGraphScene';
  import { fileRelationSnapshotToRenderGraph, buildSelectionIndex, selectionNeighborhood, emptyGraphNeighborhood, selectionDistanceByNodeId, visibleEdgeIdsForRelationDetails } from '../graph-v0';
  import type { RenderGraph, RenderGraphNode, DirectoryGraphSceneSelection, LayoutAlgorithmId, FocusedFileLayoutAlgorithmId, FocusedCircularBundlingMode, DirectoryGraphEdgeStyle, DirectoryGraphLeafEdgeStyle, FileRelationDetail } from '../graph-v0';
  import { projectSymbolOverlay } from '../intent-graph/symbolOverlay';
  import type { IntentBackend, IntentKind, IntentRecord } from './types';

  const native = new TauriArchitectureBackend();
  const nativeAvailable = native.isAvailable();
  const previewMode = new URLSearchParams(window.location.search).get('preview');
  const mixedPreview = !nativeAvailable && previewMode === 'mixed';
  const preview = !nativeAvailable && (previewMode === '1' || mixedPreview);
  const loader = new WorkspaceLoader();
  let generation = 0;
  let recordRequest = 0;
  let intentBackend: IntentBackend = new NativeIntentBackend();
  let scene = $state<DirectoryGraphScene>();
  let mount: HTMLDivElement;
  let graph = $state<GraphSnapshotDto | null>(null);
  let sourceAnalysis = $state<SourceAnalysisDto | null>(null);
  const dialectOverrides = new SvelteMap<string, SyntaxDialect>();
  let fileSnapshot = $state<FileRelationGraphSnapshotDto | null>(null);
  let renderGraph = $state<RenderGraph | null>(null);
  let records = $state<IntentRecord[]>([]);
  let selectedId = $state<string | null>(null);
  let baseSelectedId = $state<string | null>(null);
  let edgeSelectedId = $state<string | null>(null);
  const expanded = new SvelteSet<string>();
  const collapsedDirectories = new SvelteSet<string>();
  let sourcePath = $state('');
  let error = $state('');
  let notice = $state('');
  let busy = $state(false);
  let saving = $state(false);
  let historyReady = $state(false);
  let kind = $state<IntentKind>('original');
  let parentId = $state('');
  let text = $state('');
  let showHistory = $state(false);
  let filter = $state('');
  let layout = $state<LayoutAlgorithmId>('weighted-safe-radial-tree');
  let focusedLayout = $state<FocusedFileLayoutAlgorithmId>('circular');
  let bundling = $state<FocusedCircularBundlingMode>('hierarchy');
  let edgeStyle = $state<DirectoryGraphEdgeStyle>('c-curve');
  let rootEdgeStyle = $state<DirectoryGraphEdgeStyle>('elbow');
  let leafEdgeStyle = $state<DirectoryGraphLeafEdgeStyle>('straight');
  let relationDetail = $state('all');
  const drafts = new SvelteMap<string, { text: string; kind: IntentKind; parentId: string }>();
  const selected = $derived(graph?.nodes.find(node => node.id === selectedId) ?? null);
  const selectedBase = $derived(renderGraph?.nodes.find(node => node.id === baseSelectedId) ?? null);
  const selectedSyntaxFile = $derived(sourceAnalysis?.files.find(file => file.identity.path === selectedBase?.path) ?? null);
  const selectedDeclaration = $derived(selectedSyntaxFile?.declarations.find(declaration => declaration.id === selectedId) ?? null);
  const syntaxFacts = $derived(selectedSyntaxFile?.relations.filter(fact => !selectedId || fact.ownerId === selectedId) ?? []);
  const fileSyntaxDiagnostics = $derived([...(sourceAnalysis?.diagnostics.filter(d => d.path === selectedBase?.path) ?? []), ...(selectedSyntaxFile?.diagnostics ?? [])]);
  const selectedEdge = $derived(fileSnapshot?.edges.find(edge => edge.id === edgeSelectedId) ?? null);
  const selectedRecords = $derived(records.filter(record => showHistory || record.symbol.nodeId === selectedId));
  const originals = $derived(records.filter(record => record.kind === 'original' && record.symbol.nodeId === selectedId && record.bindingStatus === 'current'));
  const relations = $derived(graph?.edges.filter(edge => edge.sourceId === selectedId || edge.targetId === selectedId) ?? []);
  const fileRelations = $derived(fileSnapshot?.edges.filter(edge => edge.kind !== 'contains' && (edge.fromNodeId === baseSelectedId || edge.toNodeId === baseSelectedId)) ?? []);
  const details = $derived((relationDetail === 'all' ? ['structure','imports','calls','data','tests','configuration','contracts'] : relationDetail === 'calls' ? ['structure','imports','calls'] : ['structure', ...(relationDetail === 'imports' ? ['imports'] : [])]) as FileRelationDetail[]);
  const visibleEdges = $derived(renderGraph ? visibleEdgeIdsForRelationDetails(renderGraph, details) : new Set<string>());
  const index = $derived(renderGraph ? buildSelectionIndex(renderGraph, { visibleEdgeIds: visibleEdges }) : null);
  const neighborhood = $derived(index && baseSelectedId ? selectionNeighborhood(index, baseSelectedId) : emptyGraphNeighborhood());
  const distance = $derived(index && baseSelectedId ? selectionDistanceByNodeId(index, baseSelectedId) : null);
  const overlay = $derived(renderGraph ? projectSymbolOverlay(renderGraph, fileSnapshot?.sourceRoot ?? '', graph, expanded) : null);
  const rows = $derived.by(() => {
    if (!renderGraph) return [];
    const byId = new Map(renderGraph.nodes.map(node => [node.id,node]));
    const result: { node: RenderGraphNode; depth: number }[] = []; const visited = new SvelteSet<string>();
    function visit(id: string, depth: number) {
      const node=byId.get(id); if(!node || visited.has(id))return;visited.add(id);
      if(node.kind !== 'file' || node.path.toLowerCase().includes(filter.toLowerCase()))result.push({node,depth});
      if(!collapsedDirectories.has(id) || filter)for(const child of node.childIds)visit(child,depth+1);
    }
    visit(renderGraph.rootNodeId,0);return result;
  });

  $effect(() => {
    if (!scene) return;
    if (!renderGraph || !overlay) { scene.clearGraph(); return; }
    scene.updateGraph(renderGraph, { layoutAlgorithm: layout, focusedFileLayoutAlgorithm: focusedLayout, focusedCircularBundlingMode: bundling, edgeStyle, rootEdgeStyle, leafDirectoryEdgeStyle: leafEdgeStyle, selectedNodeId: baseSelectedId, selectedEdgeId: edgeSelectedId, nodeDistanceById: distance, highlightedNodeIds: neighborhood.highlightedNodeIds, highlightedEdgeIds: neighborhood.highlightedEdgeIds, labeledNodeIds: neighborhood.labeledNodeIds, visibleEdgeIds: visibleEdges, onSelect: selectBase });
    scene.updateSymbols(overlay, selectedId, selectNode);
  });
  $effect(() => { if(edgeSelectedId && !visibleEdges.has(edgeSelectedId)) edgeSelectedId=null; });

  onMount(() => {
    try { scene = new DirectoryGraphScene(mount); } catch(cause) { error = `3D view unavailable: ${message(cause)}. Use the navigator to continue.`; }
    void initialize();
    return () => { generation++; recordRequest++; loader.invalidate(); scene?.dispose(); };
  });
  function message(cause: unknown): string { return cause instanceof Error ? cause.message : typeof cause === 'object' && cause !== null && 'message' in cause ? String(cause.message) : String(cause); }
  function receiveFiles(snapshot: FileRelationGraphSnapshotDto) { fileSnapshot=snapshot;renderGraph=fileRelationSnapshotToRenderGraph(snapshot);sourcePath=snapshot.sourceRoot; }
  async function initialize() {
    const current=++generation;busy=true;
    try {
      if(mixedPreview) {
        const {mixedFiles,mixedSymbols,mixedAnalysis,mixedSources}=await import('./mixedWorkspaceFixture');
        const sources=await mixedSources();if(current!==generation)return;
        sourceAnalysis=validateGraphAnalysis(mixedSymbols,mixedAnalysis);
        intentBackend=new SyntaxPreviewIntentBackend(localStorage,mixedSymbols,mixedAnalysis,sources);
        receiveFiles(structuredClone(mixedFiles));graph=structuredClone(mixedSymbols);historyReady=true;
        dialectOverrides.set('include/api.h','cpp');dialectOverrides.set('web/View.js','jsx');
      } else if(preview) {
        const sources=await fixtureSources();if(current!==generation)return;
        intentBackend=new PreviewIntentBackend(localStorage,fixtureSymbols,sources);
        receiveFiles(structuredClone(fixtureFiles));graph=structuredClone(fixtureSymbols);historyReady=true;
      } else if(nativeAvailable) {
        const config=await native.getAppConfig();if(current!==generation)return;
        sourcePath=config.sourceRepoPath ?? '';historyReady=Boolean(config.sourceRepoPath);
        if(config.sourceRepoPath) {
          try {
            const files=await native.loadFileRelationGraph(config.sourceRepoPath);if(current!==generation)return;
            receiveFiles(files);
            // Restore history without reanalysis; adding new intent still requires a fresh analysis.
            const existing=await native.getGraphSnapshot();if(current!==generation)return;
            if(existing?.sourceRoot===files.sourceRoot) {
              const syntax=existing.schemaVersion===2?await native.getSourceAnalysis(existing.sourceRoot,existing.generatedAt):null;
              if(current!==generation)return;sourceAnalysis=validateGraphAnalysis(existing,syntax);graph=existing;
              dialectOverrides.clear();for(const [path,dialect] of restoredDialectOverrides(sourceAnalysis))dialectOverrides.set(path,dialect);
            }
          } catch(cause) { if(current===generation)error=`File graph unavailable: ${message(cause)}`; }
        }
      }
      if(historyReady)await refreshRecords(current);
    } catch(cause) {if(current===generation)error=message(cause);}
    finally {if(current===generation)busy=false;}
  }
  async function analyze() {
    if(busy||saving||!sourcePath.trim())return;
    const overrides=sourcePath.trim()===fileSnapshot?.sourceRoot?Object.fromEntries(dialectOverrides):{};
    if(sourcePath.trim()!==fileSnapshot?.sourceRoot)dialectOverrides.clear();
    const current=++generation;recordRequest++;historyReady=false;busy=true;error='';notice='';drafts.clear();selectedId=null;baseSelectedId=null;edgeSelectedId=null;text='';expanded.clear();collapsedDirectories.clear();records=[];graph=null;sourceAnalysis=null;fileSnapshot=null;renderGraph=null;
    await loader.open(native,sourcePath,{
      files(snapshot){if(current===generation)receiveFiles(snapshot);},
      configured(){if(current===generation)historyReady=true;},
      symbols(snapshot,syntax){if(current===generation){graph=snapshot;sourceAnalysis=syntax;notice='File graph loaded. Select a file to expand its symbols.';}},
      error(cause){if(current===generation)error=`${renderGraph?'File graph available. Symbol analysis unavailable: ':''}${message(cause)}`;},
      done(){if(current===generation)busy=false;},
    },overrides);
    if(current===generation&&historyReady)await refreshRecords(current);
  }
  function changeDialect(path:string,value:string) {
    if(!nativeAvailable||busy||saving)return;
    if(value)dialectOverrides.set(path,value as SyntaxDialect);else dialectOverrides.delete(path);
    void analyze();
  }
  function saveDraft(){if(selectedId)drafts.set(selectedId,{text,kind,parentId});}
  function selectBase(selection: DirectoryGraphSceneSelection) {
    if(saving)return;saveDraft();selectedId=null;text='';notice='';
    baseSelectedId=selection.kind==='node'?selection.id:null;edgeSelectedId=selection.kind==='edge'?selection.id:null;
  }
  function selectNode(id:string) {
    if(id===selectedId||saving||!overlay)return;
    const fileId=overlay.fileIdBySymbolId.get(id);if(!fileId||!expanded.has(fileId))return;
    saveDraft();selectedId=id;baseSelectedId=fileId;edgeSelectedId=null;
    const draft=drafts.get(id);kind=draft?.kind??'original';parentId=draft?.parentId??'';text=draft?.text??'';notice='';
  }
  function symbolsFor(file:RenderGraphNode) {return graph?.sourceRoot===fileSnapshot?.sourceRoot?graph?.nodes.filter(node=>!['file','workspace','crate'].includes(node.kind)&&node.sourceRange?.path===file.path)??[]:[];}
  function toggleFile(file:RenderGraphNode) {
    if(saving)return;
    const close=expanded.has(file.id);selectBase({kind:'node',id:file.id});expanded.clear();if(!close)expanded.add(file.id);
  }
  function toggleDirectory(id:string) {if(collapsedDirectories.has(id))collapsedDirectories.delete(id);else collapsedDirectories.add(id);}
  async function refreshRecords(current=generation) {
    const request=++recordRequest;
    try {
      const next=await intentBackend.listRecords();
      if(current!==generation||request!==recordRequest)return;
      records=next;
    } catch(cause) {if(current===generation&&request===recordRequest)error=message(cause);}
  }
  async function saveIntent() {
    if(!graph||!selectedId||saving||busy||!text.trim())return;
    const current=generation;const input={nodeId:selectedId,text,kind,parentId:kind==='original'?null:parentId,expectedAnalysisAt:graph.generatedAt};
    saving=true;error='';notice='';
    try {
      await intentBackend.appendRecord(input);if(current!==generation)return;
      await refreshRecords(current);if(current!==generation)return;
      if(selectedId===input.nodeId)text='';drafts.delete(input.nodeId);
      notice=`${input.kind==='original'?'Original intent':input.kind==='proposal'?'Proposal':'Interpretation'} saved as a new journal entry.`;
    } catch(cause) {if(current===generation)error=message(cause);}
    finally {if(current===generation)saving=false;}
  }
  function label(id:string){return graph?.nodes.find(node=>node.id===id)?.label??'Unresolved symbol';}
  function fileLabel(id:string){return renderGraph?.nodes.find(node=>node.id===id)?.path??id;}
  function when(value:string){const date=new Date(/^\d+$/.test(value)?Number(value):value);return Number.isNaN(date.getTime())?value:date.toLocaleString();}
</script>

<div class="intent-app">
  <header class="topbar">
    <div class="brand"><span class="brand-icon">W</span><div><strong>WHIP DOCS</strong><span>Intent, in context</span></div></div>
    <div class="top-meta"><span class="mode-dot"></span>{preview ? 'FIXTURE PREVIEW' : nativeAvailable ? 'LOCAL WORKSPACE' : 'DESKTOP REQUIRED'}<span class="version">PROTOTYPE · 01</span></div>
  </header>

  {#if preview}
    <div class="preview-banner"><strong>Browser fixture</strong> Recorded multi-file graph from the Rust backend, replayed locally. Native Tauri IPC is not running. Intent entries stay in this browser. <a href={mixedPreview?"?preview=1":"?preview=mixed"}>{mixedPreview?"Legacy Rust fixture":"Mixed-language fixture"}</a></div>
  {:else if !nativeAvailable}
    <div class="preview-banner"><strong>Open the Tauri desktop app to analyze a local Repository.</strong> <a href="?preview=mixed">Open the mixed-language browser fixture</a> · <a href="?preview=1">Legacy Rust fixture</a></div>
  {/if}

  {#if nativeAvailable}
    <form class="repo-bar" onsubmit={(event) => { event.preventDefault(); void analyze(); }}>
      <label for="source-root">Repository</label><input id="source-root" placeholder="Absolute path to a local repository" bind:value={sourcePath} disabled={busy || saving} /><button class="primary" disabled={busy || saving || !sourcePath.trim()}>{busy ? 'Analyzing…' : 'Open and analyze'}</button>
    </form>
  {/if}

  <main class="workspace">
    <aside class="navigator">
      <div class="section-heading"><span>REPOSITORY</span><span>{renderGraph?.nodes.filter(n=>n.kind==='file').length??0} FILES</span></div>
      <h1>{preview?(mixedPreview?'Mixed-language fixture':'Graph fixture'):fileSnapshot?.sourceRoot.split(/[\\/]/).pop()??'Open a workspace'}</h1>
      <p class="muted small">Explore files and their relationships. Expand a file to see its symbols.</p>
      <input class="search" aria-label="Find a file" placeholder="Find a file…" bind:value={filter} />
      <div class="file-list">
        {#each rows as {node,depth} (node.id)}
          <div class="file-row" style:padding-left={`${depth*9}px`}>
            {#if node.kind==='file'}<button class="expand" aria-label={`${expanded.has(node.id)?'Collapse':'Expand'} ${node.path}`} aria-expanded={expanded.has(node.id)} disabled={saving||!symbolsFor(node).length} onclick={()=>toggleFile(node)}>{expanded.has(node.id)?'−':'+'}</button>
            {:else}<button class="expand" aria-label={`Toggle directory ${node.path}`} aria-expanded={!collapsedDirectories.has(node.id)} onclick={()=>toggleDirectory(node.id)}>{collapsedDirectories.has(node.id)?'›':'⌄'}</button>{/if}
            <button class:selected={baseSelectedId===node.id&&!selectedId} class="file-name" data-node-id={node.id} onclick={()=>selectBase({kind:'node',id:node.id})} title={node.path}>{node.name}<small>{node.kind==='directory'?' /':''}</small></button>
          </div>
          {#if expanded.has(node.id)}<div class="symbol-list">{#each symbolsFor(node) as symbol (symbol.id)}<button class:selected={selectedId===symbol.id} onclick={()=>selectNode(symbol.id)}><span class="kind-dot" data-kind={symbol.kind}></span><span>{symbol.label}</span><small>{symbol.kind.replaceAll('_',' ')}</small></button>{/each}</div>{/if}
        {/each}
      </div>
      <div class="nav-bottom">{#if sourceAnalysis}<details class="analysis-coverage"><summary>Source coverage · {sourceAnalysis.files.length} captured files</summary><p>{sourceAnalysis.identity.discoveryComplete?'Discovery completed; unsupported files excluded.':'Discovery incomplete. Some files were not captured.'}</p><p>{QUALIFICATION_GAPS}</p></details>{/if}<span class="eyebrow">EVIDENCE BOUNDARY</span><p>File relations retain direction, confidence and evidence. Symbol locations are approximate. Intent and proposals never change observed relationships.</p></div>
    </aside>
    <section class="graph-area" aria-label="3D file and symbol graph">
      <div class="graph-title"><span class="eyebrow">OBSERVED STRUCTURE</span><h2>Explore the shape of your code.</h2><p>Drag to orbit · Scroll to zoom · Select a file, then expand its symbols</p></div>
      <div class="graph-mount" bind:this={mount}></div>
      <div class="graph-toolbar">
        <button onclick={()=>scene?.fitGraph()} disabled={!renderGraph}>Fit graph</button>
        <button onclick={()=>scene?.focusSelection()} disabled={!renderGraph}>Center selection</button>
        <button onclick={()=>scene?.toggleDirectoryFocus()} disabled={!renderGraph}>Directory focus</button>
        <button onclick={()=>scene?.focusSymbols()} disabled={!expanded.size}>Frame symbols</button>
        <details class="graph-settings"><summary>Graph settings</summary>
          <label>File layout<select aria-label="File layout" bind:value={layout}><option value="weighted-safe-radial-tree">Weighted radial</option><option value="safe-radial-tree">Safe radial</option><option value="radial-tree">Radial</option><option value="layered-grid">Layered grid</option></select></label>
          <label>Focused files<select aria-label="Focused files" bind:value={focusedLayout}>{#each ['circular','grid','flow-layered','dag-layered','force-directed'] as value (value)}<option {value}>{value}</option>{/each}</select></label>
          <label>Circular bundles<select aria-label="Circular bundles" bind:value={bundling}><option value="hierarchy">Hierarchy</option><option value="adjacency-fanout">Adjacency fanout</option><option value="none">None</option></select></label>
          <label>Relations<select aria-label="Relations" bind:value={relationDetail}><option value="all">All observed</option><option value="calls">Imports + calls</option><option value="imports">Imports</option><option value="structure">Structure</option></select></label>
          <label>Global edges<select aria-label="Global edges" bind:value={edgeStyle}>{#each ['straight','bezier','c-curve','elbow'] as value (value)}<option {value}>{value}</option>{/each}</select></label>
          <label>Root edges<select aria-label="Root edges" bind:value={rootEdgeStyle}>{#each ['straight','bezier','c-curve','elbow'] as value (value)}<option {value}>{value}</option>{/each}</select></label>
          <label>Leaf edges<select aria-label="Leaf edges" bind:value={leafEdgeStyle}>{#each ['global','straight','bezier','c-curve','elbow'] as value (value)}<option {value}>{value}</option>{/each}</select></label>
        </details>
      </div>
      {#if !renderGraph&&!busy}<div class="graph-empty">Choose a local repository to begin.</div>{/if}
      {#if busy}<div class="graph-empty">Loading workspace…</div>{/if}
      <div class="graph-legend"><span><i class="legend-file"></i>File</span><span><i class="legend-type"></i>Directory / type</span><span><i class="legend-callable"></i>Callable</span><span>Focus: incoming / outgoing / mutual</span></div>
      <div class="graph-note">Graph keys: arrows navigate directories · Tab toggles directory focus · . centers selection · R fits<br />File relations remain visible when symbols expand. Proposals are annotations.</div>
    </section>
    <aside class="inspector">
      <div class="section-heading"><span>INSPECTOR</span><span>{selected?.kind.replaceAll('_',' ')??selectedBase?.kind??(selectedEdge?'RELATION':'NO SELECTION')}</span></div>
      {#if selected}
        <h2 class="symbol-title">{selected.label}</h2><p class="source-path">{selected.sourceRange?.path}</p>
        <button class="text-button" onclick={()=>selectBase({kind:'node',id:baseSelectedId!})}>Back to parent file</button>
        <div class="metadata"><span>Source location</span><strong>{sourceAnalysis?'':'~ '}line {selected.sourceRange?.startLine??'unknown'}</strong><span>Range precision</span><strong>{selectedDeclaration?'UTF-8 byte range':'Unverified'}</strong>{#if selectedDeclaration}<span>Bytes [start, end)</span><strong>{selectedDeclaration.range.startByte}–{selectedDeclaration.range.endByte}</strong><span>Header / body</span><strong>{selectedDeclaration.headerComplete?'complete':'incomplete'} / {selectedDeclaration.bodyComplete?'complete':'incomplete'}</strong>{/if}<span>Graph facts</span><strong>{relations.length} relationships</strong></div>
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

      {:else if selectedBase}
        <h2 class="symbol-title">{selectedBase.name}</h2><p class="source-path">{selectedBase.path}</p>
        <div class="metadata"><span>Graph context</span><strong>{selectedBase.kind}</strong><span>File relationships</span><strong>{fileRelations.length}</strong></div>
        {#if selectedBase.kind==='file'}
          <button class="outline wide" disabled={saving||!symbolsFor(selectedBase).length} onclick={()=>toggleFile(selectedBase)}>{expanded.has(selectedBase.id)?'Collapse symbols':'Expand symbols'} · {symbolsFor(selectedBase).length}</button>
          {#if !graph}<p class="fine">The file graph is available. Analyze the repository to add symbol detail; current analysis supports Rust Cargo workspaces.</p>{/if}
        {:else}<button class="outline wide" onclick={()=>scene?.toggleDirectoryFocus()}>Focus this directory’s files</button>{/if}
      {:else if selectedEdge}
        <h2>{selectedEdge.kind.replaceAll('_',' ')}</h2>
        <p class="source-path">{fileLabel(selectedEdge.fromNodeId)} {selectedEdge.direction==='directed'?'→':'↔'} {fileLabel(selectedEdge.toNodeId)}</p>
        <div class="metadata"><span>Direction</span><strong>{selectedEdge.direction}</strong><span>Confidence</span><strong>{selectedEdge.confidence}</strong><span>Provenance</span><strong>{selectedEdge.provenance}</strong><span>Weight / evidence</span><strong>{selectedEdge.weight} / {selectedEdge.evidenceCount}</strong></div>
        <details class="relations" open><summary>Relationship evidence</summary>{#each selectedEdge.evidenceSample as evidence, i (i)}<p>{evidence.kind.replaceAll('_',' ')} · {evidence.analyzer}<br />{evidence.sourceRange.path} · ~ line {evidence.sourceRange.startLine}{#if evidence.targetRange}<br />→ {evidence.targetRange.path} · ~ line {evidence.targetRange.startLine}{/if}</p>{/each}</details>
      {:else}<h2>Select a file</h2><p class="muted">Explore the repository graph, then expand a file to inspect symbols and preserve intent.</p>{/if}
      {#if sourceAnalysis&&selectedBase?.kind==='file'}
        <section class="syntax-metadata" aria-label="Syntax coverage">
          <div class="metadata"><span>Dialect</span><strong>{selectedSyntaxFile?.identity.dialect??'Not selected / unsupported'}</strong><span>Coverage</span><strong>{coverageLabel(selectedSyntaxFile?.identity.coverage??'outside')}</strong></div>
          {#if dialectChoices(selectedBase.path).length}<label for="dialect-override">Dialect override{preview?' (recorded fixture)':''}</label><select id="dialect-override" value={dialectOverrides.get(selectedBase.path)??''} disabled={preview||busy||saving} onchange={event=>changeDialect(selectedBase!.path,event.currentTarget.value)}><option value="">Automatic</option>{#each dialectChoices(selectedBase.path) as choice (choice)}<option value={choice}>{choice}</option>{/each}</select>{/if}
          {#each fileSyntaxDiagnostics as diagnostic, i (i)}<p class="fine" data-diagnostic={diagnostic.code}>{diagnostic.code}: {diagnostic.message}{#if diagnostic.range} · bytes [{diagnostic.range.startByte}, {diagnostic.range.endByte}){/if}</p>{/each}
          {#if syntaxFacts.length}<details class="syntax-facts"><summary>Unresolved syntax evidence · {syntaxFacts.length}</summary><p class="fine">Written syntax only. Targets are byte ranges in this file, not resolved symbol identities.</p>{#each syntaxFacts as fact,i (i)}<p><strong>{fact.kind.replaceAll('_',' ')}</strong> · {fact.qualification}<br /><small>Evidence [{fact.range.startByte}, {fact.range.endByte}) · target [{fact.targetRange.startByte}, {fact.targetRange.endByte})</small></p>{/each}</details>{/if}
        </section>
      {/if}
      {#if fileRelations.length}<details class="relations" open><summary>File relationships · {fileRelations.length}</summary><p class="fine">Legacy Rust-derived relations; multilingual syntax facts are separate.</p>{#each fileRelations as edge (edge.id)}<button class="relation-row" data-edge-id={edge.id} onclick={()=>selectBase({kind:'edge',id:edge.id})}><strong>{edge.kind.replaceAll('_',' ')}</strong><br />{fileLabel(edge.fromNodeId)} {edge.direction==='directed'?'→':'↔'} {fileLabel(edge.toNodeId)}<br /><small>{edge.provenance} · {edge.confidence} · {edge.evidenceCount} evidence</small></button>{/each}</details>{/if}
      <div class="journal-heading"><h3>Intent journal <span>{selectedRecords.length}</span></h3><button class="text-button" disabled={saving || busy || !historyReady} onclick={() => void refreshRecords()}>Reload</button></div>
      <label class="history-toggle"><input type="checkbox" bind:checked={showHistory} />Show all repository history</label>
      {#each selectedRecords as record (record.id)}
        <article class="intent-record" data-kind={record.kind}>
          <div class="record-heading"><strong>{record.kind === 'original' ? 'ORIGINAL INTENT' : record.kind === 'proposal' ? 'PROPOSED CHANGE' : 'LATER INTERPRETATION'}</strong><span>{record.bindingStatus}</span></div>
          {#if showHistory}<small>{record.symbol.label}</small>{/if}
          <p>{record.text}</p>
          {#if record.parentId}<small>Original: {record.originalId.slice(0, 20)}…</small>{/if}
          <details class="retained-structure"><summary>Retained structural context</summary>
            <p class="fine">Analysis-time metadata, {record.snapshot.precision==='syntax_byte_ranges_v1'?'syntax ranges':'approximate ranges'}. This cannot reconstruct source code.</p>
            {#each record.snapshot.structuralSnapshot.nodes as node (node.id)}<p><strong>{node.label}</strong> · {node.kind.replaceAll('_', ' ')}<br /><small>{node.sourceRange?.path} · ~ line {node.sourceRange?.startLine}</small></p>{/each}
            {#each record.snapshot.structuralSnapshot.edges as edge (edge.id)}<p><strong>{edge.kind.replaceAll('_', ' ')}</strong><br /><small>{record.snapshot.structuralSnapshot.nodes.find(node => node.id === edge.sourceId)?.label ?? edge.sourceId} → {record.snapshot.structuralSnapshot.nodes.find(node => node.id === edge.targetId)?.label ?? edge.targetId}<br />{edge.provenance} · {edge.confidence}</small></p>{/each}
          </details>
          <footer>{when(record.createdAt)}<br />{record.snapshot.byteLength.toLocaleString()} source bytes · {record.snapshot.contentHash}<br />Structure: {record.snapshot.structuralSnapshot.nodes.length} nodes · {record.snapshot.structuralSnapshot.edges.length} edges<br />Revision: {record.snapshot.repositoryRevision?.slice(0, 12) ?? 'unavailable'} · worktree may differ<br />{record.snapshot.worktreeDigestScope==='captured_multilingual_sources_v1'?'Captured multilingual source set':'Captured Rust source set'}: {record.snapshot.worktreeDigest.slice(0, 23)}…{#if record.snapshot.analysisIdentity}<br />{record.snapshot.analysisIdentity.parser} · {record.snapshot.analysisIdentity.extractor}<br />{record.snapshot.analysisIdentity.files.length} captured files · {record.snapshot.analysisIdentity.discoveryComplete?'discovery completed':'discovery incomplete'}{/if}</footer>
        </article>
      {:else}<p class="empty-journal">No intent recorded here yet.</p>{/each}

      {#if selected&&relations.length}<details class="relations"><summary>Observed symbol relationships</summary>{#each relations as edge (edge.id)}<p><strong>{edge.kind.replaceAll('_',' ')}</strong><br />{label(edge.sourceId)} → {label(edge.targetId)}<br /><small>{edge.provenance} · {edge.confidence}</small></p>{/each}</details>{/if}
      {#if graph?.diagnostics.length||fileSnapshot?.diagnostics.length}<details class="diagnostics"><summary>Analysis limits</summary>{#each [...(fileSnapshot?.diagnostics??[]),...(graph?.diagnostics??[])] as diagnostic, i (i)}<p>{diagnostic.message}</p>{/each}</details>{/if}
    </aside>
  </main>
  <footer class="statusbar" aria-live="polite"><span class:error={Boolean(error)}>{error||notice||'Explore files. Expand symbols. Preserve intent.'}</span><span>{preview?'BROWSER FIXTURE':'LOCAL JOURNAL'} · {records.length} ENTRIES</span></footer>
</div>
