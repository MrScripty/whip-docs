<script lang="ts">
 type Props = { title: string };
 let { title }: Props = $props();
 let count = $state(0);
 function read(x: number): number { return x + count; }
</script>
{#snippet card(value)}<h1>{value}</h1>{/snippet}
{@render card(title)}
