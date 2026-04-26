<script lang="ts">
  import { onMount } from 'svelte';
  import { TauriArchitectureBackend } from './backends/TauriArchitectureBackend';
  import {
    ArchitectureService,
    commandErrorMessage,
    filterGraphNodes,
    graphNodeKinds,
  } from './lib/services';
  import {
    analysisStatus,
    appConfig,
    graphError,
    graphSnapshot,
    selectedNodeId,
    sourceRepoError,
    sourceSnippet,
  } from './lib/stores';

  const backend = new TauriArchitectureBackend();
  const architectureService = new ArchitectureService(backend);

  let status = $state('Starting');
  let sourceRepoPath = $state('');
  let savingSourceRepo = $state(false);
  let analyzing = $state(false);
  let graphQuery = $state('');
  let selectedKind = $state('');
  let visibleNodes = $derived(
    $graphSnapshot
      ? filterGraphNodes($graphSnapshot.nodes, {
          query: graphQuery,
          kinds: selectedKind ? [selectedKind] : [],
          limit: 48,
        })
      : [],
  );
  let visibleKinds = $derived($graphSnapshot ? graphNodeKinds($graphSnapshot.nodes) : []);

  onMount(async () => {
    const appStatus = await backend.getAppStatus();
    const config = await architectureService.getConfig();
    const analyzer = await architectureService.getAnalysisStatus();
    const snapshot = await architectureService.getGraphSnapshot();
    status = appStatus.activeProduct;
    appConfig.set(config);
    analysisStatus.set(analyzer);
    graphSnapshot.set(snapshot);
    sourceRepoPath = config.sourceRepoPath ?? '';
  });

  async function saveSourceRepoPath() {
    savingSourceRepo = true;
    sourceRepoError.set(null);
    try {
      const config = await architectureService.setSourceRepoPath(sourceRepoPath);
      appConfig.set(config);
      sourceRepoPath = config.sourceRepoPath ?? sourceRepoPath;
    } catch (error) {
      sourceRepoError.set(commandErrorMessage(error));
    } finally {
      savingSourceRepo = false;
    }
  }

  async function analyzeSourceRepo() {
    analyzing = true;
    graphError.set(null);
    try {
      const snapshot = await architectureService.analyzeSourceRepo();
      graphSnapshot.set(snapshot);
      selectedNodeId.set(null);
      sourceSnippet.set(null);
      analysisStatus.set(await architectureService.getAnalysisStatus());
    } catch (error) {
      graphError.set(commandErrorMessage(error));
    } finally {
      analyzing = false;
    }
  }

  async function selectNode(nodeId) {
    selectedNodeId.set(nodeId);
    graphError.set(null);
    try {
      sourceSnippet.set(await architectureService.getSourceSnippet(nodeId));
    } catch (error) {
      sourceSnippet.set(null);
      graphError.set(commandErrorMessage(error));
    }
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
      <button type="submit" disabled={savingSourceRepo}>Set</button>
      <button type="button" disabled={analyzing || !$appConfig.sourceRepoPath} onclick={() => { void analyzeSourceRepo(); }}>
        Analyze
      </button>
    </form>
  </section>

  <section class="workspace" aria-label="Architecture graph workspace">
    <div class="graph-surface">
      {#if $graphSnapshot}
        <span>{$graphSnapshot.nodes.length} nodes</span>
        <span>{$graphSnapshot.edges.length} edges</span>
        <div class="graph-filters" aria-label="Graph filters">
          <input bind:value={graphQuery} placeholder="Search graph" />
          <select bind:value={selectedKind}>
            <option value="">All kinds</option>
            {#each visibleKinds as kind (kind)}
              <option value={kind}>{kind}</option>
            {/each}
          </select>
        </div>
        <div class="node-list" aria-label="Graph nodes">
          {#each visibleNodes as node (node.id)}
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
      {#if $graphSnapshot}
        <h2>Graph</h2>
        <p>{$graphSnapshot.generatedAt}</p>
        <p>{$graphSnapshot.diagnostics.length} diagnostics</p>
      {/if}
      {#if $sourceSnippet}
        <h2>Source</h2>
        <p>{$sourceSnippet.path}:{$sourceSnippet.startLine}</p>
        <pre>{$sourceSnippet.text}</pre>
      {/if}
    </aside>
  </section>
</main>
