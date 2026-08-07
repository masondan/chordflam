<script lang="ts">
	import PianoDiagram from './PianoDiagram.svelte';

	let { chordList }: { chordList: string[] } = $props();

	// 2x2 grid per page on mobile (§6.3). Desktop/wider viewports can show more
	// per row via CSS wrapping, but we keep pages of 4 for consistent swipe/tap
	// paging behaviour regardless of viewport.
	const PAGE_SIZE = 4;

	let page = $state(0);

	const pages = $derived.by(() => {
		const result: string[][] = [];
		for (let i = 0; i < chordList.length; i += PAGE_SIZE) {
			result.push(chordList.slice(i, i + PAGE_SIZE));
		}
		return result.length > 0 ? result : [[]];
	});

	$effect(() => {
		if (page >= pages.length) {
			page = Math.max(0, pages.length - 1);
		}
	});

	function prevPage() {
		if (page > 0) page -= 1;
	}

	function nextPage() {
		if (page < pages.length - 1) page += 1;
	}
</script>

{#if chordList.length > 0}
<div class="keyboard-grid">
	<div class="grid">
		{#each pages[page] as chord (chord)}
			<PianoDiagram chordName={chord} />
		{/each}
	</div>

	{#if pages.length > 1}
	<div class="pager">
		<button class="btn-icon" onclick={prevPage} disabled={page === 0} aria-label="Previous chords">‹</button>
		<span class="page-indicator">{page + 1} / {pages.length}</span>
		<button class="btn-icon" onclick={nextPage} disabled={page === pages.length - 1} aria-label="Next chords">›</button>
	</div>
	{/if}
</div>
{/if}

<style>
	.keyboard-grid {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-md);
		width: 100%;
		justify-content: center;
	}
	@media (min-width: 768px) {
		.grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.pager {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}
	.page-indicator {
		font-size: 0.85em;
		color: var(--text-secondary);
	}
	button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
</style>
