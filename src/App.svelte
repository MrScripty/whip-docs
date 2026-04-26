<script lang="ts">
  import { onMount } from 'svelte';
  import { TauriArchitectureBackend } from './backends/TauriArchitectureBackend';
  import { ArchitectureService, commandErrorMessage } from './lib/services';
  import { analysisStatus, appConfig, sourceRepoError } from './lib/stores';

  const backend = new TauriArchitectureBackend();
  const architectureService = new ArchitectureService(backend);

  let status = $state('Starting');
  let sourceRepoPath = $state('');
  let savingSourceRepo = $state(false);

  onMount(async () => {
    const appStatus = await backend.getAppStatus();
    const config = await architectureService.getConfig();
    const analyzer = await architectureService.getAnalysisStatus();
    status = appStatus.activeProduct;
    appConfig.set(config);
    analysisStatus.set(analyzer);
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
    </form>
  </section>

  <section class="workspace" aria-label="Architecture graph workspace">
    <div class="graph-surface"></div>
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
      <h2>Analyzer</h2>
      <p>{$analysisStatus.phase}</p>
    </aside>
  </section>
</main>
