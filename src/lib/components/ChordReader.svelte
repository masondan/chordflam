<script lang="ts">
	import Drawer from './Drawer.svelte';

	let { isOpen, onClose, onEdit } = $props<{
		isOpen: boolean;
		onClose: () => void;
		onEdit: () => void;
	}>();
</script>

<Drawer {isOpen}>
	<div class="header">
		<button class="btn-icon" onclick={onClose}>&lt; Back</button>
		<h2>Chord Reader</h2>
	</div>
	<div class="content">
		<p>Dummy Content for Chord Reader</p>
		<button class="btn btn-primary" onclick={onEdit}>Edit</button>
	</div>
</Drawer>

<style>
	.header {
		display: flex;
		align-items: center;
		padding: var(--space-md);
		border-bottom: 1px solid var(--color-border);
	}
	.header h2 {
		margin: 0;
		margin-left: var(--space-md);
	}
	.content {
		padding: var(--space-md);
	}
</style>