<!-- café 🐳 -->
<script lang="ts">let rows = $state([]);</script>
{#snippet card({label = "x", value: alias}: Props, [first, ...rest]: string[], suffix = format())}
  {#each rows as {id, name = fallback()}, index (key(id, index))}
    {@const {total, count: amount} = measure(alias)}
    {show(id, name, index, total, amount)}
  {/each}
  {#await pending() then {data: result = defaulted()}}
    {render(result)}
  {:catch {message}}
    {report(message)}
  {/await}
  {#await pending() catch error}{report(error)}{/await}
  {@debug alias, first}
{/snippet}
