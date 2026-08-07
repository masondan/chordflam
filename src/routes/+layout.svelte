<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import '../app.css';

	let { children } = $props();

	// Register the offline-caching service worker (Phase 6 — Branding & PWA).
	// Dev mode skips this so `vite dev` doesn't fight with cached responses.
	onMount(() => {
		if (browser && 'serviceWorker' in navigator && import.meta.env.PROD) {
			navigator.serviceWorker.register('/service-worker.js', { type: 'module' });
		}
	});
</script>

<div class="app-container">
	{@render children()}
</div>
