<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import ChordReader from '$lib/components/ChordReader.svelte';
	import ChordActions from '$lib/components/ChordActions.svelte';
	import Icon from '$lib/components/icons/Icon.svelte';
	import { getAllSongs, toggleFavourite, deleteSong, type Song } from '$lib/db/db';
	import logotype from '../assets/logos/logo-chordflam-logotype.png';
	import watermark from '../assets/logos/logo-chordflam-watermark.png';

	let readerOpen = $state(false);
	let actionsOpen = $state(false);
	let editingSongId = $state<string | null>(null);
	let viewingSongId = $state<string | null>(null);
	let songs = $state<Song[]>([]);
	let deleteModalOpen = $state(false);
	let songToDeleteId = $state<string | null>(null);

	// Where ChordActions should return to on Cancel/Save & Close — set whenever
	// it's opened, so editing from ChordReader (e.g. to change key) returns the
	// user to ChordReader rather than always dropping back to chordLibrary.
	let actionsSource = $state<'library' | 'reader'>('library');

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
		actionsSource = 'library';
		actionsOpen = true;
	}

	function openEdit(id: string) {
		editingSongId = id;
		actionsSource = 'library';
		actionsOpen = true;
	}

	function openEditFromReader(id: string) {
		editingSongId = id;
		actionsSource = 'reader';
		readerOpen = false;
		actionsOpen = true;
	}

	function openReader(id: string) {
		viewingSongId = id;
		readerOpen = true;
	}

	async function closeDrawers(opts?: { returnToLibrary?: boolean }) {
		actionsOpen = false;
		if (actionsSource === 'reader' && !opts?.returnToLibrary) {
			// Return to Chord Reader for the same song (e.g. user only changed key).
			readerOpen = true;
		} else {
			readerOpen = false;
			viewingSongId = null;
			actionsSource = 'library';
		}
		await refreshSongs();
	}

	// ChordReader's own "Back to Songs" must always go straight to the
	// library, regardless of how the reader got (re)opened. Sharing
	// closeDrawers between both drawers caused a bug: after an Actions→
	// Reader round trip, actionsSource stayed 'reader', so tapping Back
	// to Songs re-entered the "return to reader" branch instead of
	// closing — the drawer appeared to do nothing.
	function closeReader() {
		readerOpen = false;
		viewingSongId = null;
		actionsSource = 'library';
	}

	async function handleToggleFavourite(id: string) {
		await toggleFavourite(id);
		await refreshSongs();
	}

	function requestDelete(id: string) {
		songToDeleteId = id;
		deleteModalOpen = true;
	}

	function cancelDelete() {
		deleteModalOpen = false;
		songToDeleteId = null;
	}

	async function confirmDeleteSong() {
		if (songToDeleteId) {
			await deleteSong(songToDeleteId);
			await refreshSongs();
		}
		deleteModalOpen = false;
		songToDeleteId = null;
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
				disabled={songs.length === 0}
			/>
			<Icon name="search" size={20} className="search-icon" />
		</div>
		<button
			class="icon-box"
			class:active={showFavouritesOnly}
			class:disabled={songs.length === 0}
			aria-pressed={showFavouritesOnly}
			aria-label="Show favourites only"
			onclick={() => (showFavouritesOnly = !showFavouritesOnly)}
			disabled={songs.length === 0}
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
			<button class="btn btn-empty-state" onclick={openAdd}>Add a chord sheet</button>
		</div>
	{:else if filteredSongs.length === 0}
		<div class="empty-state">
			<p>No songs match your search.</p>
		</div>
	{:else}
		<div class="songs">
			{#each groupedSongs as group (group.letter)}
				<div class="letter-group">
					<div class="letter-header">{group.letter}</div>
					{#each group.songs as song (song.id)}
						<div class="song-card">
							<div class="song-info">
								<a
									class="song-title"
									href={'#'}
									onclick={(e) => {
										e.preventDefault();
										openReader(song.id);
									}}
								>
									{song.title}
								</a>
								{#if song.artist}
									<div class="song-artist">{song.artist}</div>
								{/if}
								<div class="song-key">
									Original Key: {song.originalKey ?? '–'} | Current: {song.currentKey}
								</div>
							</div>
							<div class="actions">
								<button
									class="btn-icon"
									aria-label="Delete song"
									onclick={() => requestDelete(song.id)}
								>
									<Icon name="trash" size={20} color="var(--text-secondary)" />
								</button>
								<button
									class="btn-icon"
									aria-label="View chords"
									onclick={() => openReader(song.id)}
								>
									<Icon name="view" size={20} color="var(--text-secondary)" />
								</button>
								<button
									class="btn-icon"
									aria-label="Edit song"
									onclick={() => openEdit(song.id)}
								>
									<Icon name="edit-fill" size={20} color="var(--text-secondary)" />
								</button>
								<button
									class="btn-icon"
									aria-label={song.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
									onclick={() => handleToggleFavourite(song.id)}
								>
									<Icon
										name={song.isFavourite ? 'heart-fill' : 'heart'}
										size={20}
										color="var(--text-secondary)"
									/>
								</button>
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
	onClose={closeReader}
	onEdit={() => {
		if (viewingSongId) openEditFromReader(viewingSongId);
	}}
/>

<ChordActions isOpen={actionsOpen} {editingSongId} onClose={closeDrawers} />

{#if deleteModalOpen}
	<div class="modal-overlay">
		<div class="modal-content">
			<p>Delete chord sheet? This cannot be undone.</p>
			<div class="modal-actions">
				<button class="btn-modal" onclick={cancelDelete}>Cancel</button>
				<button class="btn-modal btn-danger" onclick={confirmDeleteSong}>Delete</button>
			</div>
		</div>
	</div>
{/if}

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
	.search-box input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
	.icon-box.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.icon-box.disabled:hover {
		border-color: var(--color-border);
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
		width: 75%;
		opacity: 0.15;
		margin-bottom: var(--space-lg);
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
		align-items: flex-start;
		padding: var(--space-md);
		background: var(--bg-surface);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-sm);
	}
	.song-info {
		min-width: 0;
	}
	.song-title {
		display: block;
		color: var(--accent-brand);
		font-weight: 700;
		font-size: var(--text-base);
		text-decoration: none;
	}
	.song-title:hover {
		text-decoration: underline;
	}
	.song-artist {
		font-size: var(--text-sm, 0.875rem);
		color: var(--text-secondary);
		margin-top: 2px;
	}
	.song-key {
		font-size: var(--text-xs, 0.75rem);
		color: var(--text-secondary);
		margin-top: var(--space-xs);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-shrink: 0;
		padding-top: 1px;
	}
	.actions .btn-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		line-height: 0;
	}
	.modal-overlay {
		position: fixed;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;
		max-width: var(--app-max-width);
		margin: 0 auto;
		background: rgba(0, 0, 0, 0.5);
		z-index: var(--z-menu);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-md);
	}
	.modal-content {
		background: var(--bg-main);
		border-radius: var(--radius-md);
		padding: var(--space-lg);
		width: 100%;
		max-width: 340px;
		box-shadow: var(--shadow-lg);
	}
	.modal-content p {
		margin: 0 0 var(--space-lg) 0;
		text-align: center;
	}
	.modal-actions {
		display: flex;
		justify-content: center;
		gap: var(--space-md);
	}
	.btn-modal {
		flex: 1;
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
		background: var(--bg-main);
		color: var(--text-primary);
		font-weight: 600;
		cursor: pointer;
	}
	.btn-modal.btn-danger {
		border-color: #d9383a;
		background: #d9383a;
		color: #ffffff;
	}
	.btn-empty-state {
		padding: var(--space-sm) var(--space-lg);
		border-radius: var(--radius-md);
		background-color: var(--accent-brand);
		color: white;
		font-weight: 600;
	}
	.btn-empty-state:hover {
		background-color: #4a1d99;
	}
</style>
