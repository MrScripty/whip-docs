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
    directorySnapshotToRenderGraph,
    emptyGraphNeighborhood,
    fileRelationSnapshotToRenderGraph,
    GRAPH_V0_LAYOUT_DEFAULTS,
    selectionDistanceByNodeId,
    selectionNeighborhood,
    visibleEdgeIdsForRelationDetails,
  } from './lib/graph-v0';
  import {
    analysisStatus,
    appConfig,
    directoryGraphSnapshot,
    fileRelationGraphSnapshot,
    graphError,
    graphSnapshot,
    selectedEdgeId,
    selectedNodeId,
    sourceRepoError,
    sourceSnippet,
  } from './lib/stores';

  const backend = new TauriArchitectureBackend();
  const architectureService = new ArchitectureService(backend);

  let backendAvailable = $state(backend.isAvailable());
  let sourceRepoPath = $state('');
  let savingSourceRepo = $state(false);
  let analyzing = $state(false);
  let loadingDirectoryGraph = $state(false);
  let graphQuery = $state('');
  let selectedKind = $state('');
  let graphMode = $state('architecture');
  let directoryPanelMode = $state('tree');
  let directorySceneModuleReady = $state(false);
  let directoryLayoutAlgorithm = $state('weighted-safe-radial-tree');
  let directoryEdgeStyle = $state('c-curve');
  let directoryRootEdgeStyle = $state('elbow');
  let directoryLeafEdgeStyle = $state('straight');
  let relationDetail = $state('imports');
  let directoryBranchSpacing = $state(GRAPH_V0_LAYOUT_DEFAULTS.siblingSpacing);
  let directoryLevelSpacing = $state(GRAPH_V0_LAYOUT_DEFAULTS.layerSpacing);
  let directoryRootLevelSpacing = $state(GRAPH_V0_LAYOUT_DEFAULTS.rootLayerSpacing);
  let graphPan = $state({ x: 0, y: 0 });
  let graphZoom = $state(1);
  let panStart = $state(null);
  let directoryGraphMount = $state<HTMLDivElement | null>(null);
  let directoryGraphScene = null;
  let directoryGraphSceneConstructor = $state(null);
  let loadingDirectorySceneModule = $state(false);
  let directoryRenderGraph = $derived(
    $fileRelationGraphSnapshot
      ? fileRelationSnapshotToRenderGraph($fileRelationGraphSnapshot)
      : $directoryGraphSnapshot
        ? directorySnapshotToRenderGraph($directoryGraphSnapshot)
        : null,
  );
  let directoryVisibleEdgeIds = $derived(
    directoryRenderGraph
      ? visibleEdgeIdsForRelationDetails(directoryRenderGraph, relationDetailsForLevel(relationDetail))
      : null,
  );
  let directorySelectionIndex = $derived(
    directoryRenderGraph
      ? buildSelectionIndex(directoryRenderGraph, { visibleEdgeIds: directoryVisibleEdgeIds })
      : null,
  );
  let selectedDirectoryNode = $derived(
    $selectedNodeId ? directorySelectionIndex?.nodeById.get($selectedNodeId) ?? null : null,
  );
  let directoryTreeAnchorPath = $derived(
    directoryRenderGraph ? directoryTreePathLabel(directoryRenderGraph, selectedDirectoryNode) : '',
  );
  let selectedDirectoryEdge = $derived(
    $selectedEdgeId ? directorySelectionIndex?.edgeById.get($selectedEdgeId) ?? null : null,
  );
  let selectedDirectoryNeighborhood = $derived(
    directorySelectionIndex && $selectedNodeId
      ? selectionNeighborhood(directorySelectionIndex, $selectedNodeId)
      : emptyGraphNeighborhood(),
  );
  let selectedDirectoryDistanceByNodeId = $derived(
    directorySelectionIndex && $selectedNodeId
      ? selectionDistanceByNodeId(directorySelectionIndex, $selectedNodeId)
      : null,
  );
  let directoryTreeRows = $derived(
    directoryRenderGraph ? buildDirectoryTreeRows(directoryRenderGraph, $selectedNodeId) : [],
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

    const sceneModuleReady = directorySceneModuleReady;

    if (!directoryGraphSceneConstructor) {
      if (!sceneModuleReady) {
        void loadDirectorySceneModule();
      }
      return;
    }

    directoryGraphScene ??= new directoryGraphSceneConstructor(directoryGraphMount);

    if (directoryRenderGraph) {
      directoryGraphScene.updateGraph(directoryRenderGraph, {
        highlightedEdgeIds: selectedDirectoryNeighborhood.highlightedEdgeIds,
        highlightedNodeIds: selectedDirectoryNeighborhood.highlightedNodeIds,
        labeledNodeIds: selectedDirectoryNeighborhood.labeledNodeIds,
        layoutAlgorithm: directoryLayoutAlgorithm,
        edgeStyle: graphEdgeStyleValue(directoryEdgeStyle),
        rootEdgeStyle: graphEdgeStyleValue(directoryRootEdgeStyle),
        leafDirectoryEdgeStyle: graphLeafDirectoryEdgeStyleValue(directoryLeafEdgeStyle),
        layoutOptions: {
          layerSpacing: directoryLevelSpacing,
          rootLayerSpacing: directoryRootLevelSpacing,
          siblingSpacing: directoryBranchSpacing,
        },
        nodeDistanceById: selectedDirectoryDistanceByNodeId,
        selectedEdgeId: $selectedEdgeId,
        selectedNodeId: $selectedNodeId,
        visibleEdgeIds: directoryVisibleEdgeIds ?? undefined,
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
      graphError.set(commandErrorMessage({
        code: 'tauri_unavailable',
        message: 'Open Whip Docs with `npm run dev:desktop`; backend commands are unavailable in a plain browser tab.',
        recoverable: true,
      }));
      return;
    }

    try {
      await backend.getAppStatus();
      const config = await architectureService.getConfig();
      const analyzer = await architectureService.getAnalysisStatus();
      const snapshot = await architectureService.getGraphSnapshot();
      appConfig.set(config);
      analysisStatus.set(analyzer);
      graphSnapshot.set(snapshot);
      sourceRepoPath = config.sourceRepoPath ?? '';
    } catch (error) {
      graphError.set(commandErrorMessage(error));
    }
  }

  async function loadDirectorySceneModule() {
    if (directoryGraphSceneConstructor || loadingDirectorySceneModule) {
      return;
    }

    loadingDirectorySceneModule = true;
    try {
      const sceneModule = await import('./lib/graph-v0/ThreeDirectoryGraphScene');
      directoryGraphSceneConstructor = sceneModule.DirectoryGraphScene;
      directorySceneModuleReady = true;
    } catch (error) {
      graphError.set(commandErrorMessage(error));
    } finally {
      loadingDirectorySceneModule = false;
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
      const sceneModulePromise = loadDirectorySceneModule();
      const snapshot = await architectureService.loadFileRelationGraph(path);
      await sceneModulePromise;
      fileRelationGraphSnapshot.set(snapshot);
      directoryGraphSnapshot.set(null);
      selectedEdgeId.set(null);
      selectedNodeId.set(null);
      sourceSnippet.set(null);
    } catch (error) {
      directoryGraphSnapshot.set(null);
      fileRelationGraphSnapshot.set(null);
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

  function buildDirectoryTreeRows(graph, selectedId) {
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const expandedIds = expandedDirectoryIds(graph, nodeById, selectedId);
    const rows = [];

    appendDirectoryTreeRow(graph.rootNodeId, 0, nodeById, expandedIds, rows);
    return rows;
  }

  function appendDirectoryTreeRow(
    nodeId,
    depth,
    nodeById,
    expandedIds,
    rows,
  ) {
    const node = nodeById.get(nodeId);

    if (!node) {
      return;
    }

    const hasChildren = node.childIds.length > 0;
    const expanded = hasChildren && expandedIds.includes(node.id);
    rows.push({ node, depth, expanded, hasChildren });

    if (!expanded) {
      return;
    }

    for (const childId of node.childIds) {
      appendDirectoryTreeRow(childId, depth + 1, nodeById, expandedIds, rows);
    }
  }

  function expandedDirectoryIds(
    graph,
    nodeById,
    selectedId,
  ) {
    const expandedIds = [graph.rootNodeId];
    let current = selectedId ? nodeById.get(selectedId) : nodeById.get(graph.rootNodeId);

    while (current) {
      if (current.kind !== 'file') {
        addUniqueId(expandedIds, current.id);
      }

      if (!current.parentId) {
        break;
      }

      addUniqueId(expandedIds, current.parentId);
      current = nodeById.get(current.parentId);
    }

    return expandedIds;
  }

  function addUniqueId(ids, id) {
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }

  function directoryTreePathLabel(graph, selectedNode) {
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const rootNode = nodeById.get(graph.rootNodeId);
    const contextNode = selectedNode ?? rootNode;
    const rootName = rootNode?.name || 'Repository';

    if (!contextNode || contextNode.id === graph.rootNodeId) {
      return `${rootName}/`;
    }

    const path = contextNode.kind === 'file'
      ? parentPath(contextNode.path)
      : contextNode.path;
    const normalizedPath = path.replace(/^\/+|\/+$/g, '');

    return normalizedPath ? `${rootName}/${normalizedPath}/` : `${rootName}/`;
  }

  function parentPath(path) {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return parts.join('/');
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

  function graphEdgeStyleValue(value) {
    if (value === 'bezier' || value === 'c-curve' || value === 'elbow') {
      return value;
    }

    return 'straight';
  }

  function graphLeafDirectoryEdgeStyleValue(value) {
    if (value === 'global') {
      return 'global';
    }

    return graphEdgeStyleValue(value);
  }

  function relationDetailsForLevel(level) {
    if (level === 'structure') {
      return ['structure'];
    }

    if (level === 'calls') {
      return ['structure', 'imports', 'calls'];
    }

    if (level === 'data') {
      return ['structure', 'imports', 'calls', 'data'];
    }

    if (level === 'tests') {
      return ['structure', 'imports', 'calls', 'data', 'tests'];
    }

    if (level === 'configuration') {
      return ['structure', 'imports', 'calls', 'data', 'tests', 'configuration'];
    }

    if (level === 'contracts') {
      return ['structure', 'imports', 'calls', 'data', 'tests', 'configuration', 'contracts'];
    }

    return ['structure', 'imports'];
  }

  function toggleDirectorySettings() {
    directoryPanelMode = directoryPanelMode === 'settings' ? 'tree' : 'settings';
  }
</script>

<main class="app-shell">
  <section class="toolbar" aria-label="Source repository">
    <button
      type="button"
      class="settings-toggle"
      class:active={directoryPanelMode === 'settings'}
      aria-label={directoryPanelMode === 'settings' ? 'Close settings' : 'Open settings'}
      aria-pressed={directoryPanelMode === 'settings'}
      onclick={toggleDirectorySettings}
    >
      <svg class="settings-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.08A1.7 1.7 0 0 0 4.64 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.54a1.7 1.7 0 0 0 1-1.56V3a2 2 0 0 1 4 0v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
      </svg>
    </button>
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
    <aside class="navigator" aria-label="Directory graph navigator">
      {#if directoryPanelMode === 'settings'}
        <div class="navigator-settings" aria-label="3D graph settings">
          {#if directoryRenderGraph}
            {#if $fileRelationGraphSnapshot}
              <div class="settings-metric">{$fileRelationGraphSnapshot.analyzers.length} analyzers / {$fileRelationGraphSnapshot.diagnostics.length} diagnostics</div>
            {:else if $directoryGraphSnapshot}
              <div class="settings-metric">{$directoryGraphSnapshot.excludedPathCount} excluded</div>
            {/if}
            <label class="settings-field" for="relation-detail">
              <span>Detail</span>
              <select id="relation-detail" bind:value={relationDetail} aria-label="3D graph relation detail">
                <option value="structure">Structure</option>
                <option value="imports">Imports</option>
                <option value="calls">Calls</option>
                <option value="data">Data</option>
                <option value="tests">Tests</option>
                <option value="configuration">Configuration</option>
                <option value="contracts">Contracts</option>
              </select>
            </label>
            <label class="settings-field" for="directory-layout-algorithm">
              <span>Layout</span>
              <select id="directory-layout-algorithm" bind:value={directoryLayoutAlgorithm} aria-label="3D graph layout">
                <option value="radial-tree">Radial tree</option>
                <option value="safe-radial-tree">Safe radial tree</option>
                <option value="weighted-safe-radial-tree">Weighted safe radial tree</option>
                <option value="layered-grid">Layered grid</option>
              </select>
            </label>
            <label class="settings-field" for="directory-edge-style">
              <span>Edges</span>
              <select id="directory-edge-style" bind:value={directoryEdgeStyle} aria-label="3D graph edge style">
                <option value="straight">Straight edges</option>
                <option value="bezier">Bezier edges</option>
                <option value="c-curve">C curve edges</option>
                <option value="elbow">90 degree edges</option>
              </select>
            </label>
            <label class="settings-field" for="directory-root-edge-style">
              <span>Root edges</span>
              <select id="directory-root-edge-style" bind:value={directoryRootEdgeStyle} aria-label="3D graph root edge style">
                <option value="straight">Root straight</option>
                <option value="bezier">Root Bezier</option>
                <option value="c-curve">Root C curve</option>
                <option value="elbow">Root 90 degree</option>
              </select>
            </label>
            <label class="settings-field" for="directory-leaf-edge-style">
              <span>Leaf dirs</span>
              <select id="directory-leaf-edge-style" bind:value={directoryLeafEdgeStyle} aria-label="3D graph leaf directory edge style">
                <option value="global">Leaf dirs global</option>
                <option value="straight">Leaf dirs straight</option>
                <option value="bezier">Leaf dirs Bezier</option>
                <option value="c-curve">Leaf dirs C curve</option>
                <option value="elbow">Leaf dirs 90 degree</option>
              </select>
            </label>
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
            <label class="range-control" for="directory-level-spacing">
              <span>Level spacing</span>
              <input
                id="directory-level-spacing"
                type="range"
                min="4"
                max="32"
                step="1"
                value={directoryLevelSpacing}
                oninput={(event) => { directoryLevelSpacing = Number(event.currentTarget.value); }}
                aria-label="3D graph level spacing"
              />
              <output for="directory-level-spacing">{directoryLevelSpacing}</output>
            </label>
            <label class="range-control" for="directory-root-level-spacing">
              <span>Root level spacing</span>
              <input
                id="directory-root-level-spacing"
                type="range"
                min="4"
                max="80"
                step="1"
                value={directoryRootLevelSpacing}
                oninput={(event) => { directoryRootLevelSpacing = Number(event.currentTarget.value); }}
                aria-label="3D graph root level spacing"
              />
              <output for="directory-root-level-spacing">{directoryRootLevelSpacing}</output>
            </label>
          {:else}
            <p>Load a 3D graph to edit graph settings.</p>
          {/if}
        </div>
      {:else if directoryRenderGraph}
        <div class="directory-tree-scroll">
          <div class="directory-tree-anchor" aria-label="Current directory path">{directoryTreeAnchorPath}</div>
          <div class="directory-tree" role="tree" aria-label="Directory graph tree">
            {#each directoryTreeRows as row (row.node.id)}
              <button
                type="button"
                role="treeitem"
                aria-level={row.depth + 1}
                aria-selected={$selectedNodeId === row.node.id}
                aria-expanded={row.hasChildren ? row.expanded : undefined}
                class:selected={$selectedNodeId === row.node.id}
                class:directory={row.node.kind !== 'file'}
                class:file={row.node.kind === 'file'}
                style={`--tree-depth: ${row.depth};`}
                onclick={() => { selectDirectoryEntity({ kind: 'node', id: row.node.id }); }}
              >
                <span
                  class="tree-disclosure"
                  class:expanded={row.expanded}
                  class:hidden={!row.hasChildren}
                  aria-hidden="true"
                ></span>
                <span class={`tree-kind tree-kind-${row.node.kind}`} aria-hidden="true"></span>
                <span class="tree-label">{row.node.name}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <p>No directory graph loaded</p>
      {/if}
    </aside>
    <div class="graph-surface" class:directory-loaded={directoryRenderGraph}>
      {#if directoryRenderGraph}
        <div
          class="directory-scene-frame"
          bind:this={directoryGraphMount}
          aria-label="3D directory and file graph"
          role="img"
        >
          {#if loadingDirectorySceneModule || !directoryGraphSceneConstructor}
            <div class="directory-scene-loading">Loading 3D renderer</div>
          {/if}
          <div class="directory-scene-count" aria-label="Directory graph count">
            {directoryRenderGraph.nodes.length} nodes / {directoryRenderGraph.edges.length} edges
          </div>
        </div>
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
        {#if !directoryRenderGraph}
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
      {#if directoryRenderGraph}
        <h2>3D Graph</h2>
        <p>{directoryRenderGraph.nodes.length} nodes / {directoryRenderGraph.edges.length} edges</p>
        {#if $fileRelationGraphSnapshot}
          <p>{$fileRelationGraphSnapshot.analyzers.length} analyzers / {$fileRelationGraphSnapshot.diagnostics.length} diagnostics</p>
        {/if}
        {#if selectedDirectoryNode}
          <p>{selectedDirectoryNode.kind}: {selectedDirectoryNode.path}</p>
        {/if}
        {#if selectedDirectoryEdge}
          <p>{selectedDirectoryEdge.kind}: {selectedDirectoryEdge.fromNodeId} -> {selectedDirectoryEdge.toNodeId}</p>
          {#if selectedDirectoryEdge.evidenceCount}
            <p>{selectedDirectoryEdge.evidenceCount} evidence records</p>
          {/if}
        {/if}
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
