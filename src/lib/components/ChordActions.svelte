<script lang="ts">
	import Drawer from './Drawer.svelte';
	import KeyboardGrid from './KeyboardGrid.svelte';
	import { parseSong, formatParsedLineForDisplay } from '$lib/utils/parser';
	import { transposeRawText, transposeChord } from '$lib/utils/transpose';
	import { detectKey, isMajorEdit } from '$lib/utils/keyDetection';
	import {
		getSong,
		saveSong,
		deleteSong,
		getSettings,
		updateSettings,
		exportLibrary,
		importLibrary,
		type ParsedLine,
		type Song
	} from '$lib/db/db';

	let { isOpen, editingSongId, onClose } = $props<{
		isOpen: boolean;
		editingSongId: string | null;
		onClose: () => void;
	}>();

	// --- Core form/song state ---
	let title = $state('');
	let artist = $state('');
	let rawText = $state('');
	let isPreview = $state(false);
	let hasParsedOnce = $state(false);
	let parsedLines = $state<ParsedLine[]>([]);
	let chordList = $state<string[]>([]);
	let parseError = $state(false);
	let saveError = $state(false);

	// Key tracking (§5.5, §5.9)
	let originalKey = $state('');
	let currentKey = $state('');
	let transposeOffset = $state(0);

	// Fields not edited directly in this drawer but must round-trip on save
	let fontSize = $state(18);
	let chordColour = $state('#6E36D1');
	let isFavourite = $state(false);
	let dateAdded = $state('');

	// The id this drawer session is working against. For Add mode this is
	// generated on first successful "Chord It" and reused for subsequent
	// taps in the same session (so we update, not duplicate, on repeat saves).
	let workingSongId: string | null = null;

	let showUnsavedModal = $state(false);
	let showDeleteModal = $state(false);

	// Import/export
	let importFileInput: HTMLInputElement | undefined = $state();
	let importMessage = $state('');

	// Undo/redo — plain array stack scoped to this drawer session (§5.7, placeholder for v1)
	let history = $state<string[]>([]);
	let redoStack = $state<string[]>([]);
	let textareaRef: HTMLTextAreaElement | undefined = $state();

	// Snapshot of state as of the last successful "Chord It" (or initial load).
	// The drawer is "dirty" whenever current state diverges from this snapshot,
	// or a transpose preview is pending — covers §5.6.
	let committed = $state({ title: '', artist: '', rawText: '' });

	let dirty = $derived(
		title !== committed.title ||
			artist !== committed.artist ||
			rawText !== committed.rawText ||
			transposeOffset !== 0
	);

	// Live transpose preview (§5.9) — updates key/chord-progression display only;
	// mini-keyboards and rawText are NOT touched until "Chord It" commits.
	let liveCurrentKey = $derived.by(() => {
		if (!currentKey) return '';
		return transposeOffset === 0 ? currentKey : transposeChord(currentKey, transposeOffset);
	});

	let liveChordProgression = $derived.by(() => {
		if (transposeOffset === 0) return chordList;
		return chordList.map((c) => transposeChord(c, transposeOffset));
	});

	let transposeOffsetLabel = $derived(transposeOffset > 0 ? `+${transposeOffset}` : `${transposeOffset}`);

	// Tracks which song (or "new song") was last loaded into the drawer, so we only
	// (re)initialise fields when the drawer actually opens or switches songs — never
	// on every render. Deliberately a plain (non-$state) variable: it must NOT be a
	// reactive dependency of the $effect below, or writing state from within that
	// effect would re-trigger it on every keystroke and wipe user input instantly.
	let loadedKey: string | null = null;

	$effect(() => {
		if (!isOpen) {
			loadedKey = null;
			return;
		}

		const key = editingSongId ?? '__new__';
		if (key === loadedKey) return; // already loaded for this open/song — don't reset user input
		loadedKey = key;

		if (editingSongId) {
			loadExistingSong(editingSongId);
		} else {
			resetForNewSong();
		}
	});

	async function loadExistingSong(id: string) {
		const song = await getSong(id);
		if (!song) {
			resetForNewSong();
			return;
		}

		workingSongId = song.id;
		title = song.title;
		artist = song.artist ?? '';
		rawText = song.rawText;
		originalKey = song.originalKey ?? '';
		currentKey = song.currentKey;
		transposeOffset = 0;
		fontSize = song.fontSize;
		chordColour = song.chordColour;
		isFavourite = song.isFavourite;
		dateAdded = song.dateAdded;

		committed = { title, artist, rawText };
		hasParsedOnce = true;
		isPreview = true;
		parseError = false;
		history = [];
		redoStack = [];
		runParse(rawText, { silent: true });
	}

	async function resetForNewSong() {
		const settings = await getSettings();

		workingSongId = null;
		title = '';
		artist = '';
		rawText = '';
		originalKey = '';
		currentKey = '';
		transposeOffset = 0;
		fontSize = settings.defaultFontSize;
		chordColour = settings.defaultChordColour;
		isFavourite = false;
		dateAdded = new Date().toISOString();

		committed = { title: '', artist: '', rawText: '' };
		hasParsedOnce = false;
		isPreview = false;
		parsedLines = [];
		chordList = [];
		parseError = false;
		history = [];
		redoStack = [];
	}

	function handleClose() {
		if (dirty) {
			showUnsavedModal = true;
		} else {
			onClose();
		}
	}

	function confirmClose() {
		showUnsavedModal = false;
		onClose();
	}

	function cancelClose() {
		showUnsavedModal = false;
	}

	/**
	 * Runs the parser against `text` and updates parsedLines/chordList/rawText.
	 * `silent` skips the friendly-failure UI path (used for loading already-saved,
	 * previously-valid songs, where a parse "failure" just means zero chords found —
	 * not something to alarm the user about on open).
	 */
	function runParse(text: string, opts: { silent?: boolean } = {}) {
		try {
			const result = parseSong(text);
			parsedLines = result.parsedLines;
			chordList = result.chordList;
			// Per §5.4: rawText IS bracket notation. A raw chords-over-lyrics paste
			// (UG/Chordu/E-Chords style) is converted to bracket notation once, here,
			// on first "Chord It" — from then on Edit shows/edits real bracket notation.
			rawText = result.normalizedText;
			parseError = false;
		} catch (e) {
			console.error('Parse failed:', e);
			if (!opts.silent) {
				parseError = true;
			}
		}
	}

	async function chordIt() {
		const previousChordList = chordList;
		const hadKeyBefore = hasParsedOnce;

		runParse(rawText);

		if (parseError) {
			// Friendly failure state (§5.8) — do not switch to Preview, do not save.
			return;
		}

		if (chordList.length === 0 && rawText.trim().length > 0) {
			// No chord tokens recognised at all in non-empty text — treat as a
			// parser failure per §5.8 rather than silently showing an empty song.
			parseError = true;
			return;
		}

		// --- Key detection / preservation (§5.5) ---
		if (!hadKeyBefore) {
			// First-ever parse for this song (new song, or first Chord It on an
			// import that had no key yet): detect fresh.
			originalKey = detectKey(chordList);
			currentKey = originalKey;
		} else {
			const major = isMajorEdit(previousChordList, chordList);
			if (major) {
				originalKey = detectKey(chordList);
				currentKey = originalKey;
			}
			// else: minor edit — originalKey/currentKey untouched (§5.5 rule 3).
		}

		// --- Commit transpose preview, if any (§5.9) ---
		if (transposeOffset !== 0) {
			currentKey = transposeChord(currentKey, transposeOffset);
			rawText = transposeRawText(rawText, transposeOffset);
			// Re-parse the transposed text so parsedLines/chordList reflect new chord names.
			const retransposed = parseSong(rawText);
			parsedLines = retransposed.parsedLines;
			chordList = retransposed.chordList;
			transposeOffset = 0;
		}

		hasParsedOnce = true;
		isPreview = true;

		try {
			await persist();
			// IMPORTANT: only mark the drawer "clean" once the write has actually
			// completed. Setting this before/without awaiting persist() let the
			// user tap Back the instant Chord It was tapped and close the drawer
			// (no unsaved-changes warning) before the IndexedDB write landed —
			// silently losing the song if the save was still in flight or failed.
			committed = { title, artist, rawText };
			saveError = false;
		} catch (e) {
			console.error('Failed to save song:', e);
			// Leave `committed` untouched so `dirty` stays true — the
			// unsaved-changes modal will still catch an attempt to close.
			saveError = true;
		}
	}

	async function persist() {
		if (!workingSongId) {
			workingSongId = crypto.randomUUID();
		}

		// Svelte 5 `$state` fields are reactive Proxies. IndexedDB's structured-clone
		// algorithm (used internally by Dexie) can throw/silently misbehave when handed
		// a Proxy instead of a plain object/array — `$state.snapshot()` unwraps them to
		// plain, cloneable data before we hand anything to Dexie.
		const song: Song = $state.snapshot({
			id: workingSongId,
			title: title.trim() || 'Untitled',
			artist: artist.trim() || null,
			rawText,
			parsedLines,
			chordList,
			originalKey: originalKey || null,
			currentKey: currentKey || originalKey || 'C',
			fontSize,
			chordColour,
			isFavourite,
			dateAdded: dateAdded || new Date().toISOString()
		});

		await saveSong(song);
		await updateSettings({ defaultFontSize: fontSize, defaultChordColour: chordColour });
	}

	function togglePreview() {
		if (!hasParsedOnce) return;
		isPreview = !isPreview;
	}

	// --- Toolbar: text editing helpers (§5.3) ---

	function pushHistory() {
		history = [...history, rawText];
		redoStack = [];
	}

	function insertAtCursor(before: string, after = '') {
		const el = textareaRef;
		if (!el) {
			rawText += before + after;
			return;
		}
		pushHistory();
		const start = el.selectionStart ?? rawText.length;
		const end = el.selectionEnd ?? rawText.length;
		const newText = rawText.slice(0, start) + before + after + rawText.slice(end);
		rawText = newText;
		const cursorPos = start + before.length;
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(cursorPos, cursorPos);
		});
	}

	function addChordToken() {
		insertAtCursor('[', ']');
	}

	function insertFlat() {
		insertAtCursor('b');
	}

	function insertSharp() {
		insertAtCursor('#');
	}

	function cutSelection() {
		const el = textareaRef;
		if (!el) return;
		const start = el.selectionStart ?? 0;
		const end = el.selectionEnd ?? 0;
		if (start === end) return;
		pushHistory();
		const selected = rawText.slice(start, end);
		navigator.clipboard?.writeText(selected).catch(() => {});
		rawText = rawText.slice(0, start) + rawText.slice(end);
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start, start);
		});
	}

	function copySelection() {
		const el = textareaRef;
		if (!el) return;
		const start = el.selectionStart ?? 0;
		const end = el.selectionEnd ?? 0;
		if (start === end) return;
		const selected = rawText.slice(start, end);
		navigator.clipboard?.writeText(selected).catch(() => {});
	}

	function onTextareaInput() {
		// Individual keystrokes are not pushed to history one-by-one (that would
		// make undo useless); history snapshots are taken by the toolbar actions
		// and before any programmatic mutation. Plain typing is left to the
		// browser's native undo within the textarea itself.
	}

	function undo() {
		if (history.length === 0) return;
		const previous = history[history.length - 1];
		history = history.slice(0, -1);
		redoStack = [...redoStack, rawText];
		rawText = previous;
	}

	function redo() {
		if (redoStack.length === 0) return;
		const next = redoStack[redoStack.length - 1];
		redoStack = redoStack.slice(0, -1);
		history = [...history, rawText];
		rawText = next;
	}

	// --- Transpose control (§5.9) ---

	function transposeDown() {
		transposeOffset -= 1;
	}

	function transposeUp() {
		transposeOffset += 1;
	}

	function revertTranspose() {
		transposeOffset = 0;
	}

	// --- Delete (§5.10) ---

	function requestDelete() {
		showDeleteModal = true;
	}

	async function confirmDelete() {
		showDeleteModal = false;
		if (workingSongId) {
			await deleteSong(workingSongId);
		}
		onClose();
	}

	function cancelDelete() {
		showDeleteModal = false;
	}

	// --- Import / Export (§5.11) ---

	async function handleExport() {
		const json = await exportLibrary();
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `chordflam-export-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function triggerImport() {
		importFileInput?.click();
	}

	async function handleImportFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			await importLibrary(text);
			importMessage = 'Import successful.';
		} catch (err) {
			console.error(err);
			importMessage = 'Import failed — file may be invalid.';
		} finally {
			input.value = '';
			setTimeout(() => (importMessage = ''), 4000);
		}
	}
</script>

<Drawer {isOpen}>
	<div class="header">
		<button class="btn-icon" onclick={handleClose}>&lt; Back</button>
		<h2>{editingSongId ? 'Edit Song' : 'Add Song'}</h2>
	</div>
	<div class="content">
        <div class="form-group">
            <label for="title">Title</label>
            <input type="text" id="title" bind:value={title} placeholder="Song Title" />
        </div>
        <div class="form-group">
            <label for="artist">Artist</label>
            <input type="text" id="artist" bind:value={artist} placeholder="Artist Name" />
        </div>

        <p class="helper">
            Paste your chord sheet below.
            Source links: <a href="https://www.ultimate-guitar.com" target="_blank">Ultimate Guitar</a>,
            <a href="https://chordu.com" target="_blank">Chordu</a>,
            <a href="https://www.e-chords.com" target="_blank">E-Chords</a>
        </p>

        {#if parseError}
        <div class="parse-error">
            <p><strong>I'm having trouble recognising that chord pattern.</strong></p>
            <p>Try pasting the complete chord sheet again.</p>
            <p class="tip">Tip: Include both the chords and lyrics.</p>
        </div>
        {/if}

        {#if saveError}
        <div class="parse-error">
            <p><strong>Couldn't save your chord sheet.</strong></p>
            <p>Please try tapping Chord It again.</p>
        </div>
        {/if}

        {#if !isPreview}
        {#if hasParsedOnce}
        <div class="toolbar">
            <button onclick={addChordToken}>Add Chord</button>
            <button onclick={insertFlat}>b</button>
            <button onclick={insertSharp}>#</button>
            <button onclick={cutSelection}>Cut</button>
            <button onclick={copySelection}>Copy</button>
            <button onclick={undo} disabled={history.length === 0} class="undo-redo" aria-label="Undo">↶</button>
            <button onclick={redo} disabled={redoStack.length === 0} class="undo-redo" aria-label="Redo">↷</button>
        </div>
        {/if}

        <textarea
            class="canvas"
            bind:value={rawText}
            bind:this={textareaRef}
            oninput={onTextareaInput}
            placeholder="[Am]Twinkle [C]twinkle..."
        ></textarea>
        {:else}
        <div class="preview-canvas">
            {#if parsedLines.length === 0}
                <p class="empty-preview">Nothing to preview yet.</p>
            {:else}
                {#each parsedLines as line (line.id)}
                    {@const display = formatParsedLineForDisplay(line)}
                    {#if display.chordRow || display.lyricRow}
                        <div class="preview-line">
                            <div class="chord-row">{display.chordRow || '\u00A0'}</div>
                            <div class="lyric-row">{display.lyricRow || '\u00A0'}</div>
                        </div>
                    {:else}
                        <div class="preview-line-blank">&nbsp;</div>
                    {/if}
                {/each}
            {/if}
        </div>
        {/if}

        <div class="actions">
            <button class="primary" onclick={chordIt}>Chord It</button>
            {#if hasParsedOnce}
            <button onclick={togglePreview}>{isPreview ? 'Edit' : 'Preview'}</button>
            {/if}
        </div>

        {#if hasParsedOnce}
        <hr />

        <div class="transpose">
            <h3>Transpose</h3>
            <div class="controls">
                <button class="btn-icon" onclick={transposeDown} aria-label="Transpose down">▼</button>
                <span class="key-label">{liveCurrentKey} {transposeOffsetLabel}</span>
                <button class="btn-icon" onclick={transposeUp} aria-label="Transpose up">▲</button>
            </div>
            <div class="chord-progression">
                {#each liveChordProgression as chord (chord)}
                    <span class="chord-chip">{chord}</span>
                {/each}
            </div>
            <p class="original-key">
                Original Key: {originalKey}
                <button class="btn-link" onclick={revertTranspose} disabled={transposeOffset === 0}>Revert</button>
            </p>
        </div>

        <hr />

        {#if chordList.length > 0}
        <div class="keyboards">
            <h3>Mini-Keyboards</h3>
            <KeyboardGrid chordList={transposeOffset === 0 ? chordList : liveChordProgression} />
        </div>
        <hr />
        {/if}

        {#if editingSongId}
        <div class="delete-section">
            <button class="btn-danger" onclick={requestDelete}>Delete Chord</button>
        </div>

        <hr />
        {/if}
        {/if}

        <div class="import-export">
            <h3>Import & Export Chord Library</h3>
            <p>Save all your chord sheets as a backup, or import to another device.</p>
            <div class="buttons">
                <button onclick={handleExport}>Export</button>
                <button onclick={triggerImport}>Import</button>
                <input
                    type="file"
                    accept="application/json"
                    bind:this={importFileInput}
                    onchange={handleImportFile}
                    style="display: none;"
                />
            </div>
            {#if importMessage}
                <p class="import-message">{importMessage}</p>
            {/if}
        </div>
	</div>

	{#if showUnsavedModal}
	<div class="modal">
		<div class="modal-content">
			<p>Tap Chord It to save your changes, or Cancel to exit without saving.</p>
			<button class="primary" onclick={cancelClose}>Got It</button>
		</div>
	</div>
	{/if}

	{#if showDeleteModal}
	<div class="modal">
		<div class="modal-content">
			<p>Are you sure you want to delete this chord sheet? This cannot be undone.</p>
			<div class="modal-actions">
				<button onclick={cancelDelete}>Cancel</button>
				<button class="btn-danger" onclick={confirmDelete}>Delete</button>
			</div>
		</div>
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
	.header h2 {
		margin: 0;
		margin-left: var(--space-md);
	}
	.content {
		padding: var(--space-md);
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
	}
    .form-group {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
    }
    input, textarea {
        padding: var(--space-sm);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        font-family: inherit;
        font-size: var(--text-base);
    }
    .helper {
        font-size: 0.9em;
        color: var(--text-secondary);
    }
    .parse-error {
        background: #fdecea;
        border: 1px solid #f5c2c0;
        border-radius: var(--radius-sm);
        padding: var(--space-sm) var(--space-md);
        color: #9b2c26;
    }
    .parse-error p {
        margin: 0 0 var(--space-xs) 0;
    }
    .parse-error .tip {
        font-size: 0.85em;
        opacity: 0.85;
    }
    .toolbar {
        display: flex;
        gap: var(--space-xs);
        flex-wrap: wrap;
    }
    .toolbar .undo-redo {
        font-size: 1.1em;
    }
    .canvas {
        min-height: 200px;
        resize: vertical;
        font-family: 'Courier New', Courier, monospace;
        white-space: pre;
    }
	.preview-canvas {
		min-height: 200px;
		background: var(--bg-surface);
		padding: var(--space-sm);
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		font-family: 'Courier New', Courier, monospace;
		overflow-x: auto;
	}
	.empty-preview {
		color: var(--text-secondary);
		margin: 0;
	}
	.preview-line {
		margin-bottom: var(--space-sm);
		white-space: pre;
	}
	.preview-line-blank {
		height: 1em;
	}
	.chord-row {
		color: var(--accent-brand);
		font-weight: 700;
		margin-bottom: 2px;
		white-space: pre;
		line-height: 1.2;
	}
	.lyric-row {
		white-space: pre;
		line-height: 1.3;
	}
    .actions {
        display: flex;
        gap: var(--space-md);
    }
    .primary {
        background-color: var(--accent-brand);
        color: white;
        border: none;
        padding: var(--space-sm) var(--space-md);
        border-radius: var(--radius-sm);
        cursor: pointer;
    }
    button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .btn-danger {
        color: var(--color-danger, #d9383a);
        background: none;
        border: none;
        cursor: pointer;
        font-weight: bold;
    }
    .transpose {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-sm);
        text-align: center;
    }
    .transpose .controls {
        display: flex;
        align-items: center;
        gap: var(--space-md);
    }
    .transpose .key-label {
        font-size: var(--text-h2);
        font-weight: 700;
        min-width: 60px;
    }
    .chord-progression {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-xs);
        justify-content: center;
    }
    .chord-chip {
        background: var(--bg-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: var(--space-xs) var(--space-sm);
        font-weight: 600;
    }
    .original-key {
        margin: 0;
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        gap: var(--space-sm);
    }
    .btn-link {
        color: var(--accent-brand);
        background: none;
        border: none;
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
    }
    .keyboards h3 {
        text-align: center;
    }
    .import-export .buttons {
        display: flex;
        gap: var(--space-md);
    }
    .import-message {
        font-size: 0.9em;
        color: var(--text-secondary);
    }
	.modal {
		position: fixed;
		top: 0; left: 0; right: 0; bottom: 0;
		background: rgba(0,0,0,0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	.modal-content {
		background: white;
		padding: var(--space-md);
		border-radius: var(--radius-md);
		max-width: 400px;
	}
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-md);
        margin-top: var(--space-md);
    }
</style>
