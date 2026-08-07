<script lang="ts">
	import Drawer from './Drawer.svelte';
	import KeyboardGrid from './KeyboardGrid.svelte';
	import Icon from './icons/Icon.svelte';
	import { formatParsedLineForDisplay } from '$lib/utils/parser';
	import { getSong, updateSongDisplay, updateSettings, type Song } from '$lib/db/db';

	let { isOpen, songId, onClose, onEdit } = $props<{
		isOpen: boolean;
		songId: string | null;
		onClose: () => void;
		onEdit: () => void;
	}>();

	// Six fixed chord colour presets (§0 / §7.2) — do not invent new ones.
	const CHORD_COLOUR_PRESETS = [
		{ name: 'Brand Purple', value: '#6E36D1' },
		{ name: 'Coral Red', value: '#D9383A' },
		{ name: 'Sapphire Blue', value: '#1652E2' },
		{ name: 'Emerald Green', value: '#0D8351' },
		{ name: 'Amber Orange', value: '#C85A00' },
		{ name: 'Charcoal Slate', value: '#333C4E' }
	];

	const FONT_STEP = 2;
	const FONT_MIN = 14;
	const FONT_MAX = 28;

	let song = $state<Song | null>(null);
	let fontSize = $state(18);
	let chordColour = $state('#6E36D1');

	// Display-only toggles (§7.2) — not persisted, keyboard grid is visible by
	// default each time Chord Reader opens.
	let showKeyboards = $state(true);
	let showColourMenu = $state(false);

	// Mirrors the load-guard pattern in ChordActions: only (re)load when the
	// drawer actually opens or the song being viewed changes, never on every render.
	let loadedKey: string | null = null;

	$effect(() => {
		if (!isOpen) {
			loadedKey = null;
			showColourMenu = false;
			return;
		}

		const key = songId ?? '__none__';
		if (key === loadedKey) return;
		loadedKey = key;

		showKeyboards = true;
		showColourMenu = false;

		if (songId) {
			loadSong(songId);
		} else {
			song = null;
		}
	});

	async function loadSong(id: string) {
		const result = await getSong(id);
		song = result ?? null;
		if (song) {
			fontSize = song.fontSize;
			chordColour = song.chordColour;
		}
	}

	async function persistDisplay() {
		if (!song) return;
		await updateSongDisplay(song.id, { fontSize, chordColour });
		await updateSettings({ defaultFontSize: fontSize, defaultChordColour: chordColour });
	}

	function increaseFontSize() {
		fontSize = Math.min(FONT_MAX, fontSize + FONT_STEP);
		persistDisplay();
	}

	function decreaseFontSize() {
		fontSize = Math.max(FONT_MIN, fontSize - FONT_STEP);
		persistDisplay();
	}

	function toggleKeyboards() {
		showKeyboards = !showKeyboards;
	}

	function toggleColourMenu() {
		showColourMenu = !showColourMenu;
	}

	function selectColour(value: string) {
		chordColour = value;
		showColourMenu = false;
		persistDisplay();
	}
</script>

<Drawer {isOpen}>
	<div class="header">
		<button class="btn-icon back-link" onclick={onClose}>&lt; Back</button>
	</div>

	{#if song}
	<div class="content">
		<div class="title-block">
			<h1>{song.title}</h1>
			{#if song.artist}
				<p class="artist">{song.artist}</p>
			{/if}
			<p class="keys">
				Current Key: <strong>{song.currentKey}</strong>
				{#if song.originalKey}
					&nbsp;|&nbsp; Original Key: <strong>{song.originalKey}</strong>
				{/if}
			</p>
			{#if song.chordList.length > 0}
			<p class="chords-line">
				Chords: {#each song.chordList as chord, i}{chord}{i < song.chordList.length - 1 ? '  ' : ''}{/each}
			</p>
			{/if}
		</div>

		<div class="toolbar">
			<button class="btn-icon" onclick={toggleKeyboards} aria-label={showKeyboards ? 'Hide keyboards' : 'Show keyboards'}>
				<Icon name={showKeyboards ? 'piano-on' : 'piano-off'} size={22} />
			</button>
			<button class="btn-icon" onclick={decreaseFontSize} aria-label="Smaller text" disabled={fontSize <= FONT_MIN}>
				<Icon name="text-decrease" size={22} />
			</button>
			<button class="btn-icon" onclick={increaseFontSize} aria-label="Larger text" disabled={fontSize >= FONT_MAX}>
				<Icon name="text-increase" size={22} />
			</button>
			<div class="colour-picker">
				<button class="btn-icon colour-swatch-btn" onclick={toggleColourMenu} aria-label="Chord colour">
					<span class="colour-swatch" style="background-color:{chordColour}"></span>
				</button>
				{#if showColourMenu}
				<div class="colour-menu">
					{#each CHORD_COLOUR_PRESETS as preset (preset.value)}
						<button
							class="colour-option"
							class:active={preset.value === chordColour}
							onclick={() => selectColour(preset.value)}
						>
							<span class="colour-swatch" style="background-color:{preset.value}"></span>
							{preset.name}
						</button>
					{/each}
				</div>
				{/if}
			</div>
			<button class="btn-icon" onclick={onEdit} aria-label="Edit">
				<Icon name="edit-fill" size={22} />
			</button>
		</div>

		{#if showKeyboards && song.chordList.length > 0}
		<div class="keyboards">
			<KeyboardGrid chordList={song.chordList} />
		</div>
		{/if}

		<div class="chord-sheet" style="font-size:{fontSize}px; --chord-colour:{chordColour}">
			{#each song.parsedLines as line (line.id)}
				{@const display = formatParsedLineForDisplay(line)}
				{#if display.chordRow || display.lyricRow}
					<div class="sheet-line">
						<div class="chord-row">{display.chordRow || '\u00A0'}</div>
						<div class="lyric-row">{display.lyricRow || '\u00A0'}</div>
					</div>
				{:else}
					<div class="sheet-line-blank">&nbsp;</div>
				{/if}
			{/each}
		</div>
	</div>
	{:else}
	<div class="content">
		<p class="empty">Song not found.</p>
	</div>
	{/if}
</Drawer>

<style>
	.header {
		display: flex;
		align-items: center;
		padding: var(--space-md);
		border-bottom: 1px solid var(--color-border);
	}
	.back-link {
		font-weight: 600;
	}
	.content {
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}
	.title-block h1 {
		margin-bottom: var(--space-xs);
	}
	.artist {
		margin: 0 0 var(--space-xs) 0;
		color: var(--text-secondary);
	}
	.keys {
		margin: 0 0 var(--space-xs) 0;
		color: var(--text-secondary);
	}
	.chords-line {
		margin: 0;
		font-weight: 600;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-wrap: wrap;
		border-top: 1px solid var(--color-border);
		border-bottom: 1px solid var(--color-border);
		padding: var(--space-sm) 0;
	}
	.toolbar button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.colour-picker {
		position: relative;
	}
	.colour-swatch {
		display: inline-block;
		width: 18px;
		height: 18px;
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
	}
	.colour-menu {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: var(--z-menu);
		background: var(--bg-main);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-md);
		padding: var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		min-width: 160px;
	}
	.colour-option {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-sm);
		text-align: left;
		white-space: nowrap;
	}
	.colour-option:hover,
	.colour-option.active {
		background: var(--bg-surface);
	}
	.keyboards {
		padding: var(--space-sm) 0;
	}
	.chord-sheet {
		font-family: 'Courier New', Courier, monospace;
	}
	.sheet-line {
		margin-bottom: var(--space-sm);
		white-space: pre-wrap;
	}
	.sheet-line-blank {
		height: 1em;
	}
	.chord-row {
		color: var(--chord-colour, var(--accent-brand));
		font-weight: 700;
		margin-bottom: 2px;
		white-space: pre;
		line-height: 1.2;
	}
	.lyric-row {
		white-space: pre-wrap;
		line-height: 1.3;
	}
	.empty {
		color: var(--text-secondary);
		text-align: center;
		padding: var(--space-xl) 0;
	}
</style>
