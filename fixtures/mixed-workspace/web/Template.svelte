<!-- 蟹🦀: exact byte offsets include this prefix -->
<script lang="ts">
  let rows = $state([]);
  function ready(): boolean { return true; }
</script>
{ready() ? show(rows) : hide()}
<button onclick={() => select(rows)} title={label(rows)}>Go</button>
{#if ready()}{show(rows)}{:else if retry()}{hide()}{/if}
{#each rows.filter(ready) as row, index (key(row))}{format(row, index)}{/each}
{#await fetchRows()}{pending()}{:then result}{render(result)}{:catch error}{report(error)}{/await}
{#key key(rows)}{refresh()}{/key}
{#snippet card(value)}{format(value)}{/snippet}
{@render card(rows)}
{@const total = count(rows)}
{@html markup(rows)}
{@debug rows}
