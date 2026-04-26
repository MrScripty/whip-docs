<script lang="ts">
  import { onMount } from 'svelte';
  import { TauriArchitectureBackend } from './backends/TauriArchitectureBackend';

  const backend = new TauriArchitectureBackend();

  let status = $state('Starting');

  onMount(async () => {
    const appStatus = await backend.getAppStatus();
    status = appStatus.activeProduct;
  });
</script>

<main class="app-shell">
  <section class="toolbar" aria-label="Source repository">
    <div>
      <h1>Whip Docs</h1>
      <p>{status}</p>
    </div>
    <button type="button" disabled>Select Repo</button>
  </section>

  <section class="workspace" aria-label="Architecture graph workspace">
    <div class="graph-surface"></div>
    <aside class="inspector">
      <h2>Snapshot</h2>
      <p>No repository selected</p>
    </aside>
  </section>
</main>

