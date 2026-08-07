<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import ChordReader from '$lib/components/ChordReader.svelte';
	import ChordActions from '$lib/components/ChordActions.svelte';
	import Icon from '$lib/components/icons/Icon.svelte';
	import { getAllSongs, toggleFavourite, type Song } from '$lib/db/db';
	import logotype from '../assets/logos/logo-chordflam-logotype.png';
	import watermark from '../assets/logos/logo-chordflam-maskable.png';

	let readerOpen = $state(false);
	let actionsOpen = $state(false);
	let editingSongId = $state<string | null>(null);
	let viewingSongId = $state<string | null>(null);
	let songs = $state<Song[]>([]);

	// Toolbar: search text and favourites-only filter (both client-side —
	// no separate query layer needed for a single-user local library).
	let searchQuery = $state('');
	let showFavouritesOnly = $state(false);

	// Songs after applying the search + favourites-only filters, before
	// alphabetical grouping.
	let filteredSongs = $derived.by((): Song[] => {
		const q = searchQuery.trim().toLowerCase();
		return songs.filter((song) => {
			if (showFavouritesOnly && !song.isFavourite) return false;
			if (!q) return true;
			return (
				song.title.toLowerCase().includes(q) || (song.artist ?? '').toLowerCase().includes(q)
			);
		});
	});

	// Group songs alphabetically by first letter of title (§7.1), sorted
	// case-insensitively within each group. Titles starting with a non-letter
	// character are grouped under "#".
	type SongGroup = { letter: string; songs: Song[] };
	let groupedSongs = $derived.by((): SongGroup[] => {
		const sorted = [...filteredSongs].sort((a, b) =>
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
	<div class="header-separator"></div>

	<div class="toolbar">
		<div class="search-box">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search Songs"
				aria-label="Search songs"
			/>
			<Icon name="search" size={20} className="search-icon" />
		</div>
		<button
			class="icon-box"
			class:active={showFavouritesOnly}
			aria-pressed={showFavouritesOnly}
			aria-label="Show favourites only"
			onclick={() => (showFavouritesOnly = !showFavouritesOnly)}
		>
			<Icon name={showFavouritesOnly ? 'heart-fill' : 'heart'} size={20} />
		</button>
		<button class="icon-box icon-box-primary" aria-label="Add new chords" onclick={openAdd}>
			<Icon name="add" size={22} color="#ffffff" />
		</button>
	</div>

	{#if songs.length === 0}
		<div class="empty-state">
			<img src={watermark} alt="" class="watermark" />
			<p>Your library is empty</p>
			<button class="btn btn-primary" onclick={openAdd}>Add your first sheet</button>
		</div>
	{:else if filteredSongs.length === 0}
		<div class="empty-state">
			<p>No songs match your search.</p>
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
		align-items: center;
		height: 46px;
		padding: 0;
		margin-bottom: var(--space-sm);
	}
	.header-separator {
		width: 100vw;
		height: 1px;
		background-color: var(--color-border);
		margin: 0 calc(-50vw + 50%);
		margin-bottom: var(--space-md);
	}
	.toolbar {
		display: flex;
		align-items: stretch;
		gap: var(--space-sm);
		margin-bottom: var(--space-lg);
	}
	.search-box {
		position: relative;
		flex: 1;
		min-width: 0;
	}
	.search-box input {
		width: 100%;
		height: 44px;
		padding: 0 var(--space-xl) 0 var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: var(--text-base);
		background: var(--bg-main);
		color: var(--text-primary);
		box-sizing: border-box;
	}
	.search-box input::placeholder {
		color: var(--text-secondary);
	}
	.search-box input:focus {
		outline: none;
		border-color: var(--accent-brand);
	}
	.search-box :global(.search-icon) {
		position: absolute;
		right: var(--space-sm);
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-secondary);
		pointer-events: none;
	}
	.icon-box {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--bg-main);
		color: var(--text-primary);
	}
	.icon-box:hover {
		border-color: var(--color-border-active, var(--text-secondary));
	}
	.icon-box.active {
		background: var(--accent-brand);
		border-color: var(--accent-brand);
		color: #ffffff;
	}
	.icon-box-primary {
		background: var(--accent-brand);
		border-color: var(--accent-brand);
	}
	.icon-box-primary:hover {
		background: #4a1d99;
		border-color: #4a1d99;
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
