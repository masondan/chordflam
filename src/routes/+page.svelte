<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import ChordReader from '$lib/components/ChordReader.svelte';
	import ChordActions from '$lib/components/ChordActions.svelte';
	import { getAllSongs, toggleFavourite, type Song } from '$lib/db/db';
	import logotype from '../assets/logos/logo-chordflam-logotype.png';
	import watermark from '../assets/logos/logo-chordflam-maskable.png';

	let readerOpen = $state(false);
	let actionsOpen = $state(false);
	let editingSongId = $state<string | null>(null);
	let viewingSongId = $state<string | null>(null);
	let songs = $state<Song[]>([]);

	// Group songs alphabetically by first letter of title (§7.1), sorted
	// case-insensitively within each group. Titles starting with a non-letter
	// character are grouped under "#".
	type SongGroup = { letter: string; songs: Song[] };
	let groupedSongs = $derived.by((): SongGroup[] => {
		const sorted = [...songs].sort((a, b) =>
			a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
		);
		const groups = new Map<string, Song[]>();
		for (const song of sorted) {
			const firstChar = song.title.trim().charAt(0).toUpperCase();
			const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';
			if (!groups.has(letter)) groups.set(letter, []);
			groups.get(letter)!.push(song);
		}
		return Array.from(groups.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([letter, songs]) => ({ letter, songs }));
	});

	// Dexie/IndexedDB only exists in the browser — calling it during SSR (or at
	// module-eval time) throws, which previously surfaced as an unhandled promise
	// rejection that crashed the entire Vite dev server. All DB access here is
	// deliberately confined to onMount / post-mount event handlers.
	async function refreshSongs() {
		if (!browser) return;
		songs = await getAllSongs();
	}

	onMount(() => {
		refreshSongs();
	});

	function openAdd() {
		editingSongId = null;
		actionsOpen = true;
	}

	function openEdit(id: string) {
		editingSongId = id;
		actionsOpen = true;
	}

	function openReader(id: string) {
		viewingSongId = id;
		readerOpen = true;
	}

	async function closeDrawers() {
		readerOpen = false;
		actionsOpen = false;
		await refreshSongs();
	}

	async function handleToggleFavourite(id: string) {
		await toggleFavourite(id);
		await refreshSongs();
	}
</script>

<div class="library">
	<header>
		<div class="logo">
			<img src={logotype} alt="ChordFlam" height="32" />
		</div>
	</header>

	<div class="toolbar">
		<button class="btn btn-primary" onclick={openAdd}>Add Chords</button>
		<button class="btn">Search</button>
		<button class="btn">Favourites</button>
	</div>

	{#if songs.length === 0}
		<div class="empty-state">
			<img src={watermark} alt="" class="watermark" />
			<p>Your library is empty</p>
			<button class="btn btn-primary" onclick={openAdd}>Add your first sheet</button>
		</div>
	{:else}
		<div class="songs">
			<h3>All Songs</h3>
			{#each groupedSongs as group (group.letter)}
				<div class="letter-group">
					<div class="letter-header">{group.letter}</div>
					{#each group.songs as song (song.id)}
						<div class="song-card">
							<div>
								<strong>{song.title}</strong><br />
								<small>{song.artist ?? 'Unknown artist'} - Key: {song.currentKey}</small>
							</div>
							<div class="actions">
								<button class="btn-icon" onclick={() => handleToggleFavourite(song.id)}>
									{song.isFavourite ? '♥' : '♡'}
								</button>
								<button class="btn-icon" onclick={() => openReader(song.id)}>View</button>
								<button class="btn-icon" onclick={() => openEdit(song.id)}>Edit</button>
							</div>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>

<ChordReader
	isOpen={readerOpen}
	songId={viewingSongId}
	onClose={closeDrawers}
	onEdit={() => {
		readerOpen = false;
		if (viewingSongId) openEdit(viewingSongId);
	}}
/>

<ChordActions isOpen={actionsOpen} {editingSongId} onClose={closeDrawers} />

<style>
	.library {
		padding: var(--space-md);
	}
	header {
		display: flex;
		justify-content: center;
		padding: var(--space-md) 0;
		margin-bottom: var(--space-md);
	}
	.toolbar {
		display: flex;
		gap: var(--space-sm);
		margin-bottom: var(--space-lg);
	}
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: var(--space-xl) 0;
		color: var(--text-secondary);
	}
	.watermark {
		width: 120px;
		opacity: 0.1;
		margin-bottom: var(--space-md);
	}
	.letter-group {
		margin-bottom: var(--space-md);
	}
	.letter-header {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: var(--space-xs) 0;
		margin-bottom: var(--space-xs);
		border-bottom: 1px solid var(--color-border);
	}
	.song-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-md);
		background: var(--bg-surface);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-sm);
	}
	.actions {
		display: flex;
		gap: var(--space-sm);
	}
</style>
