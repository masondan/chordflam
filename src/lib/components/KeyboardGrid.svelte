<script lang="ts">
	import PianoDiagram from './PianoDiagram.svelte';

	let { chordList }: { chordList: string[] } = $props();
</script>

{#if chordList.length > 0}
<div class="keyboard-grid">
	<div class="grid">
		{#each chordList as chord (chord)}
			<PianoDiagram chordName={chord} />
		{/each}
	</div>
</div>
{/if}

<style>
	.keyboard-grid {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
	}
	/* Fixed 2-column grid, no wider breakpoint. This is a mobile-first app
	   capped at --app-max-width (480px) even on desktop, so there's no need
	   (or room) for a 4-column layout — that previously caused fixed-width
	   SVG diagrams to overflow the container on desktop. All chords are
	   shown at once (no paging/slider); with an odd count the last row
	   simply has one item, left-aligned by the grid's natural flow. */
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-md);
		width: 100%;
		justify-content: center;
	}
</style>
