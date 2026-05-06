<script lang="ts">
  import { onMount } from 'svelte';
  import { TauriArchitectureBackend } from './backends/TauriArchitectureBackend';
  import {
    ArchitectureService,
    buildGraphLayout,
    commandErrorMessage,
    filterGraphNodes,
    graphLabel,
    graphNodeKinds,
    projectGraph,
  } from './lib/services';
  import {
    buildSelectionIndex,
    DirectoryGraphScene,
    directorySnapshotToRenderGraph,
    emptyGraphNeighborhood,
    GRAPH_V0_LAYOUT_DEFAULTS,
    selectionNeighborhood,
  } from './lib/graph-v0';
  import {
    analysisStatus,
    appConfig,
    directoryGraphSnapshot,
    graphError,
    graphSnapshot,
    selectedEdgeId,
    selectedNodeId,
    sourceRepoError,
    sourceSnippet,
  } from './lib/stores';

  const backend = new TauriArchitectureBackend();
  const architectureService = new ArchitectureService(backend);

  let status = $state('Starting');
  let backendAvailable = $state(backend.isAvailable());
  let sourceRepoPath = $state('');
  let savingSourceRepo = $state(false);
  let analyzing = $state(false);
  let loadingDirectoryGraph = $state(false);
  let graphQuery = $state('');
  let selectedKind = $state('');
  let graphMode = $state('architecture');
  let directoryLayoutAlgorithm = $state('radial-tree');
  let directoryBranchSpacing = $state(GRAPH_V0_LAYOUT_DEFAULTS.siblingSpacing);
  let graphPan = $state({ x: 0, y: 0 });
  let graphZoom = $state(1);
  let panStart = $state(null);
  /** @type {HTMLDivElement | null} */
  let directoryGraphMount = $state(null);
  /** @type {DirectoryGraphScene | null} */
  let directoryGraphScene = null;
  let directoryRenderGraph = $derived(
    $directoryGraphSnapshot ? directorySnapshotToRenderGraph($directoryGraphSnapshot) : null,
  );
  let directorySelectionIndex = $derived(
    directoryRenderGraph ? buildSelectionIndex(directoryRenderGraph) : null,
  );
  let selectedDirectoryNode = $derived(
    $selectedNodeId ? directorySelectionIndex?.nodeById.get($selectedNodeId) ?? null : null,
  );
  let selectedDirectoryEdge = $derived(
    $selectedEdgeId ? directorySelectionIndex?.edgeById.get($selectedEdgeId) ?? null : null,
  );
  let selectedDirectoryNeighborhood = $derived(
    directorySelectionIndex && $selectedNodeId
      ? selectionNeighborhood(directorySelectionIndex, $selectedNodeId)
      : emptyGraphNeighborhood(),
  );
  let displayGraph = $derived(
    $graphSnapshot
      ? projectGraph($graphSnapshot.nodes, $graphSnapshot.edges, graphMode)
      : { nodes: [], edges: [] },
  );
  let visibleNodes = $derived(
    $graphSnapshot
      ? filterGraphNodes(displayGraph.nodes, {
          query: graphQuery,
          kinds: selectedKind ? [selectedKind] : [],
          limit: graphMode === 'architecture' ? 1200 : 700,
        })
      : [],
  );
  let visibleKinds = $derived($graphSnapshot ? graphNodeKinds(displayGraph.nodes) : []);
  let graphLayout = $derived(
    $graphSnapshot ? buildGraphLayout(visibleNodes, displayGraph.edges) : null,
  );

  $effect(() => {
    if (!directoryGraphMount) {
      directoryGraphScene?.dispose();
      directoryGraphScene = null;
      return;
    }

    directoryGraphScene ??= new DirectoryGraphScene(directoryGraphMount);

    if (directoryRenderGraph) {
      directoryGraphScene.updateGraph(directoryRenderGraph, {
        highlightedEdgeIds: selectedDirectoryNeighborhood.highlightedEdgeIds,
        highlightedNodeIds: selectedDirectoryNeighborhood.highlightedNodeIds,
        labeledNodeIds: selectedDirectoryNeighborhood.labeledNodeIds,
        layoutAlgorithm: directoryLayoutAlgorithm,
        layoutOptions: {
          siblingSpacing: directoryBranchSpacing,
        },
        selectedEdgeId: $selectedEdgeId,
        selectedNodeId: $selectedNodeId,
        onSelect: selectDirectoryEntity,
      });
    }
  });

  onMount(() => {
    void loadInitialState();

    return () => {
      directoryGraphScene?.dispose();
      directoryGraphScene = null;
    };
  });

  async function loadInitialState() {
    backendAvailable = backend.isAvailable();
    if (!backendAvailable) {
      status = 'Tauri desktop required';
      graphError.set(commandErrorMessage({
        code: 'tauri_unavailable',
        message: 'Open Whip Docs with `npm run dev:desktop`; backend commands are unavailable in a plain browser tab.',
        recoverable: true,
      }));
      return;
    }

    try {
      const appStatus = await backend.getAppStatus();
      const config = await architectureService.getConfig();
      const analyzer = await architectureService.getAnalysisStatus();
      const snapshot = await architectureService.getGraphSnapshot();
      status = appStatus.activeProduct;
      appConfig.set(config);
      analysisStatus.set(analyzer);
      graphSnapshot.set(snapshot);
      sourceRepoPath = config.sourceRepoPath ?? '';

      if (config.sourceRepoPath) {
        await loadDirectoryGraph(config.sourceRepoPath);
      }
    } catch (error) {
      status = 'Backend unavailable';
      graphError.set(commandErrorMessage(error));
    }
  }

  async function saveSourceRepoPath() {
    savingSourceRepo = true;
    sourceRepoError.set(null);
    try {
      const config = await architectureService.setSourceRepoPath(sourceRepoPath);
      appConfig.set(config);
      sourceRepoPath = config.sourceRepoPath ?? sourceRepoPath;
      if (config.sourceRepoPath) {
        void loadDirectoryGraph(config.sourceRepoPath);
      }
    } catch (error) {
      sourceRepoError.set(commandErrorMessage(error));
    } finally {
      savingSourceRepo = false;
    }
  }

  async function loadDirectoryGraph(path = sourceRepoPath) {
    if (!path.trim()) {
      return;
    }

    loadingDirectoryGraph = true;
    graphError.set(null);
    try {
      const snapshot = await architectureService.loadDirectoryGraph(path);
      directoryGraphSnapshot.set(snapshot);
      selectedEdgeId.set(null);
      selectedNodeId.set(null);
      sourceSnippet.set(null);
    } catch (error) {
      directoryGraphSnapshot.set(null);
      graphError.set(commandErrorMessage(error));
    } finally {
      loadingDirectoryGraph = false;
    }
  }

  async function analyzeSourceRepo() {
    analyzing = true;
    graphError.set(null);
    try {
      const snapshot = await architectureService.analyzeSourceRepo();
      graphSnapshot.set(snapshot);
      selectedEdgeId.set(null);
      selectedNodeId.set(null);
      sourceSnippet.set(null);
      resetGraphView();
      analysisStatus.set(await architectureService.getAnalysisStatus());
    } catch (error) {
      graphError.set(commandErrorMessage(error));
    } finally {
      analyzing = false;
    }
  }

  async function selectNode(nodeId) {
    selectedEdgeId.set(null);
    selectedNodeId.set(nodeId);
    graphError.set(null);
    try {
      sourceSnippet.set(await architectureService.getSourceSnippet(nodeId));
    } catch (error) {
      sourceSnippet.set(null);
      graphError.set(commandErrorMessage(error));
    }
  }

  function setGraphMode(mode) {
    graphMode = mode;
    selectedKind = '';
    selectedEdgeId.set(null);
    selectedNodeId.set(null);
    sourceSnippet.set(null);
    resetGraphView();
  }

  function resetGraphView() {
    graphPan = { x: 0, y: 0 };
    graphZoom = 1;
    panStart = null;
  }

  function selectDirectoryEntity(selection) {
    sourceSnippet.set(null);
    graphError.set(null);

    if (selection.kind === 'node') {
      selectedEdgeId.set(null);
      selectedNodeId.set(selection.id);
      return;
    }

    selectedNodeId.set(null);
    selectedEdgeId.set(selection.id);
  }

  function handleGraphWheel(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const nextZoom = clamp(graphZoom * (event.deltaY < 0 ? 1.12 : 0.88), 0.18, 3.5);
    const worldX = (pointerX - graphPan.x) / graphZoom;
    const worldY = (pointerY - graphPan.y) / graphZoom;

    graphPan = {
      x: pointerX - worldX * nextZoom,
      y: pointerY - worldY * nextZoom,
    };
    graphZoom = nextZoom;
  }

  function startGraphPan(event) {
    if (event.target.closest('.graph-node')) {
      return;
    }

    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    panStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      originX: graphPan.x,
      originY: graphPan.y,
    };
  }

  function moveGraphPan(event) {
    if (!panStart || panStart.pointerId !== event.pointerId) {
      return;
    }

    graphPan = {
      x: panStart.originX + event.clientX - panStart.x,
      y: panStart.originY + event.clientY - panStart.y,
    };
  }

  function endGraphPan(event) {
    if (!panStart || panStart.pointerId !== event.pointerId) {
      return;
    }

    panStart = null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
</script>

<main class="app-shell">
  <section class="toolbar" aria-label="Source repository">
    <div>
      <h1>Whip Docs</h1>
      <p>{status}</p>
    </div>
    <form class="source-form" onsubmit={(event) => { event.preventDefault(); void saveSourceRepoPath(); }}>
      <label for="source-repo-path">Source repo</label>
      <input
        id="source-repo-path"
        bind:value={sourceRepoPath}
        placeholder="/path/to/rust/repo"
        autocomplete="off"
      />
      <button type="submit" disabled={savingSourceRepo || !backendAvailable}>Set</button>
      <button
        type="button"
        disabled={loadingDirectoryGraph || !sourceRepoPath.trim() || !backendAvailable}
        onclick={() => { void loadDirectoryGraph(); }}
      >
        Load 3D
      </button>
      <button type="button" disabled={analyzing || !$appConfig.sourceRepoPath || !backendAvailable} onclick={() => { void analyzeSourceRepo(); }}>
        Analyze
      </button>
    </form>
  </section>

  <section class="workspace" aria-label="Architecture graph workspace">
    <div class="graph-surface" class:directory-loaded={$directoryGraphSnapshot && directoryRenderGraph}>
      {#if $directoryGraphSnapshot && directoryRenderGraph}
        <div class="graph-summary" aria-label="Directory graph summary">
          <span>{$directoryGraphSnapshot.nodes.length} nodes</span>
          <span>{$directoryGraphSnapshot.edges.length} edges</span>
          <span>{$directoryGraphSnapshot.excludedPathCount} excluded</span>
          <select bind:value={directoryLayoutAlgorithm} aria-label="3D graph layout">
            <option value="radial-tree">Radial tree</option>
            <option value="layered-grid">Layered grid</option>
          </select>
          <label class="range-control" for="directory-branch-spacing">
            <span>Branch spacing</span>
            <input
              id="directory-branch-spacing"
              type="range"
              min="4"
              max="32"
              step="1"
              value={directoryBranchSpacing}
              oninput={(event) => { directoryBranchSpacing = Number(event.currentTarget.value); }}
              aria-label="3D graph branch spacing"
            />
            <output for="directory-branch-spacing">{directoryBranchSpacing}</output>
          </label>
        </div>
        <div
          class="directory-scene-frame"
          bind:this={directoryGraphMount}
          aria-label="3D directory and file graph"
          role="img"
        ></div>
      {:else if $graphSnapshot}
        <div class="graph-summary" aria-label="Graph summary">
          <span>{$graphSnapshot.nodes.length} nodes</span>
          <span>{$graphSnapshot.edges.length} edges</span>
          <span>{displayGraph.edges.length} graph edges</span>
          <span>{visibleNodes.length} visible</span>
        </div>
        <div class="graph-filters" aria-label="Graph filters">
          <div class="graph-mode" aria-label="Graph mode">
            <button
              type="button"
              class:active={graphMode === 'architecture'}
              onclick={() => { setGraphMode('architecture'); }}
            >
              Architecture
            </button>
            <button
              type="button"
              class:active={graphMode === 'symbols'}
              onclick={() => { setGraphMode('symbols'); }}
            >
              Symbols
            </button>
          </div>
          <input bind:value={graphQuery} placeholder="Search graph" />
          <select bind:value={selectedKind}>
            <option value="">All kinds</option>
            {#each visibleKinds as kind (kind)}
              <option value={kind}>{kind}</option>
            {/each}
          </select>
        </div>
        {#if graphLayout && graphLayout.nodes.length > 0}
          <div class="graph-canvas-frame">
            <svg
              class="graph-canvas"
              role="img"
              aria-label="Connected architecture graph"
              viewBox={`0 0 ${graphLayout.width} ${graphLayout.height}`}
              style={`width: ${Math.max(graphLayout.width, 1120)}px; height: ${Math.max(graphLayout.height, 560)}px;`}
              onwheel={handleGraphWheel}
              onpointerdown={startGraphPan}
              onpointermove={moveGraphPan}
              onpointerup={endGraphPan}
              onpointercancel={endGraphPan}
            >
              <defs>
                <marker
                  id="edge-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              <g
                class:panning={panStart !== null}
                class="graph-viewport"
                transform={`translate(${graphPan.x}, ${graphPan.y}) scale(${graphZoom})`}
              >
                {#each graphLayout.edges as edge (edge.id)}
                  <g class={`graph-edge graph-edge-${edge.kind}`}>
                    <path d={edge.path} marker-end="url(#edge-arrow)" />
                  </g>
                {/each}
                {#each graphLayout.nodes as node (node.id)}
                  <g
                    class:selected={$selectedNodeId === node.id}
                    class="graph-node"
                    role="button"
                    tabindex="0"
                    aria-label={`${node.kind}: ${node.label}`}
                    transform={`translate(${node.x}, ${node.y})`}
                    onclick={() => { void selectNode(node.id); }}
                    onkeydown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void selectNode(node.id);
                      }
                    }}
                  >
                    <circle r={node.radius} />
                    <text class="graph-node-label" y="-3">{graphLabel(node.label, 20)}</text>
                    <text class="graph-node-kind" y="13">{node.kind}</text>
                  </g>
                {/each}
              </g>
            </svg>
          </div>
        {:else}
          <div class="empty-graph">No nodes match the current filters.</div>
        {/if}
      {:else}
        {#if !$directoryGraphSnapshot}
          <div class="empty-graph">Set a local Rust repository and load the 3D graph.</div>
        {/if}
      {/if}
    </div>
    <aside class="inspector">
      <h2>Snapshot</h2>
      {#if $appConfig.sourceRepoPath}
        <p>{$appConfig.sourceRepoPath}</p>
      {:else}
        <p>No repository selected</p>
      {/if}
      {#if $sourceRepoError}
        <p class="error">{$sourceRepoError}</p>
      {/if}
      {#if $graphError}
        <p class="error">{$graphError}</p>
      {/if}
      <h2>Analyzer</h2>
      <p>{$analysisStatus.phase}</p>
      {#if $directoryGraphSnapshot}
        <h2>Directory Graph</h2>
        <p>{$directoryGraphSnapshot.nodes.length} nodes / {$directoryGraphSnapshot.edges.length} edges</p>
        {#if selectedDirectoryNode}
          <p>{selectedDirectoryNode.kind}: {selectedDirectoryNode.path}</p>
        {/if}
        {#if selectedDirectoryEdge}
          <p>edge: {selectedDirectoryEdge.fromNodeId} -> {selectedDirectoryEdge.toNodeId}</p>
        {/if}
        <div class="node-list" aria-label="Directory graph nodes">
          {#each directoryRenderGraph.nodes.slice(0, 32) as node (node.id)}
            <button
              type="button"
              class:selected={$selectedNodeId === node.id}
              onclick={() => { selectDirectoryEntity({ kind: 'node', id: node.id }); }}
            >
              <strong>{node.name}</strong>
              <small>{node.kind} / {node.path}</small>
            </button>
          {/each}
        </div>
      {/if}
      {#if $graphSnapshot}
        <h2>Graph</h2>
        <p>{$graphSnapshot.generatedAt}</p>
        <p>{$graphSnapshot.diagnostics.length} diagnostics</p>
        <div class="node-list" aria-label="Visible graph nodes">
          {#each visibleNodes.slice(0, 32) as node (node.id)}
            <button
              type="button"
              class:selected={$selectedNodeId === node.id}
              onclick={() => { void selectNode(node.id); }}
            >
              <strong>{node.label}</strong>
              <small>{node.kind}</small>
            </button>
          {/each}
        </div>
      {/if}
      {#if $sourceSnippet}
        <h2>Source</h2>
        <p>{$sourceSnippet.path}:{$sourceSnippet.startLine}</p>
        <pre>{$sourceSnippet.text}</pre>
      {/if}
    </aside>
  </section>
</main>
