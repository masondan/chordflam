<script lang="ts">
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	
	let { isOpen = false, children } = $props<{
		isOpen: boolean;
		children: any;
	}>();
</script>

{#if isOpen}
	<div class="drawer" transition:fly={{ y: '100%', duration: 300, easing: quintOut, opacity: 1 }}>
		{@render children()}
	</div>
{/if}

<style>
	.drawer {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: var(--bg-main);
		z-index: var(--z-drawer);
		display: flex;
		flex-direction: column;
		max-width: var(--app-max-width);
		margin: 0 auto;
		overflow-y: auto;
	}
</style>
