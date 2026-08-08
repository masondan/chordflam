<script lang="ts">
	import Drawer from './Drawer.svelte';
	import KeyboardGrid from './KeyboardGrid.svelte';
	import Icon from './icons/Icon.svelte';
	import { parseSong, formatParsedLineForDisplay } from '$lib/utils/parser';
	import { transposeRawText, transposeChord, semitoneDistance } from '$lib/utils/transpose';
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
		onClose: (opts?: { returnToLibrary?: boolean }) => void;
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
	// transposeOffset is always the number of semitone steps away from
	// originalKey — this is what the transpose UI displays and what the
	// chevrons/Revert control. It is NOT reset by "Chord It"; it persists
	// as the song's ongoing distance from its original key.
	let transposeOffset = $state(0);
	// appliedOffset is the offset that is currently "baked into" rawText/
	// chordList/currentKey (i.e. what was in effect as of the last Chord It,
	// or on load). The delta between transposeOffset and appliedOffset is
	// the pending, not-yet-committed preview change.
	let appliedOffset = $state(0);

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
			transposeOffset !== appliedOffset
	);

	// Edit/Preview toggle is visible from the start but stays inactive (light
	// grey, non-clickable) until the user has actually typed/pasted something.
	let hasContent = $derived(rawText.trim().length > 0);

	// Toolbar (bracket/flat/sharp/copy/undo/redo) is permanently visible but
	// stays inactive (light grey) until the user taps into the input window —
	// this lets someone type lyrics/chords manually and use the toolbar to
	// help build the sheet, before ever tapping Chord It. Once activated it
	// stays active for the rest of the drawer session, and also activates
	// immediately for existing content (e.g. loading a saved song).
	let toolbarActive = $state(false);

	function onTextareaFocus() {
		toolbarActive = true;
	}

	// Pending, not-yet-committed transpose change (semitones) — the delta
	// between what the user has dialled in and what's actually baked into
	// rawText/chordList right now.
	let pendingDelta = $derived(transposeOffset - appliedOffset);

	// Live transpose preview (§5.9) — updates key/chord-progression display only;
	// mini-keyboards and rawText are NOT touched until "Chord It" commits.
	// Always relative to originalKey, which never moves except on a major
	// re-detection — so this is always "steps away from original", even
	// right after a Chord It commit.
	let liveCurrentKey = $derived.by(() => {
		if (!originalKey) return '';
		return transposeOffset === 0 ? originalKey : transposeChord(originalKey, transposeOffset);
	});

	let liveChordProgression = $derived.by(() => {
		if (pendingDelta === 0) return chordList;
		return chordList.map((c) => transposeChord(c, pendingDelta));
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
		// Reconstruct the offset-from-original so the transpose UI opens showing
		// how far the song currently sits from its (immutable) original key.
		const savedOffset = originalKey ? semitoneDistance(originalKey, currentKey) : 0;
		transposeOffset = savedOffset;
		appliedOffset = savedOffset;
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
		toolbarActive = true;
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
		appliedOffset = 0;
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
		toolbarActive = false;
	}

	function handleCancel() {
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

	async function saveAndClose() {
		if (!dirty) return;
		await chordIt();
		if (!parseError && !saveError) {
			onClose();
		}
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
			// import that had no key yet): detect fresh. originalKey is brand new,
			// so any prior transpose dialling is meaningless — reset to 0.
			originalKey = detectKey(chordList);
			currentKey = originalKey;
			transposeOffset = 0;
			appliedOffset = 0;
		} else {
			const major = isMajorEdit(previousChordList, chordList);
			if (major) {
				// originalKey is being replaced — any transpose distance from the
				// *old* original is meaningless now, so reset to 0 as well.
				originalKey = detectKey(chordList);
				currentKey = originalKey;
				transposeOffset = 0;
				appliedOffset = 0;
			}
			// else: minor edit — originalKey untouched (§5.5 rule 3); transposeOffset
			// also untouched, since it's still measured relative to the same original.
		}

		// --- Commit transpose preview, if any (§5.9) ---
		// Chord It just "bakes in" whatever the transpose cluster currently shows.
		// originalKey never moves here; only the pending delta (the gap between
		// what's dialled in and what's already baked into rawText) is applied.
		// transposeOffset itself is NOT reset — it continues to reflect the
		// song's total distance from originalKey, even after this commit.
		const deltaToApply = transposeOffset - appliedOffset;
		if (deltaToApply !== 0) {
			rawText = transposeRawText(rawText, deltaToApply);
			// Re-parse the transposed text so parsedLines/chordList reflect new chord names.
			const retransposed = parseSong(rawText);
			parsedLines = retransposed.parsedLines;
			chordList = retransposed.chordList;
		}
		currentKey = transposeOffset === 0 ? originalKey : transposeChord(originalKey, transposeOffset);
		appliedOffset = transposeOffset;

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
		if (!hasContent) return;
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
		// The song is gone — always return to the library, never back to
		// Chord Reader (there's nothing left there to show).
		onClose({ returnToLibrary: true });
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
		<button class="btn-pill" onclick={handleCancel}>Cancel</button>
		<button class="btn-pill btn-pill-save" class:active={dirty} disabled={!dirty} onclick={saveAndClose}>
			Save &amp; Close
		</button>
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

        <div class="toolbar">
            <button
                class="toolbar-btn"
                disabled={!toolbarActive || isPreview}
                onclick={addChordToken}
                aria-label="Insert chord brackets"
            >
                <Icon name="square-brackets" size={18} />
            </button>
            <button
                class="toolbar-btn"
                disabled={!toolbarActive || isPreview}
                onclick={insertFlat}
                aria-label="Insert flat"
            >
                <Icon name="music-flat" size={26} />
            </button>
            <button
                class="toolbar-btn"
                disabled={!toolbarActive || isPreview}
                onclick={insertSharp}
                aria-label="Insert sharp"
            >
                <Icon name="music-sharp" size={26} />
            </button>
            <button
                class="toolbar-btn"
                disabled={!toolbarActive || isPreview}
                onclick={copySelection}
                aria-label="Copy selection"
            >
                <Icon name="copy" size={18} />
            </button>
            <button
                class="toolbar-btn"
                disabled={!toolbarActive || isPreview || history.length === 0}
                onclick={undo}
                aria-label="Undo"
            >
                <Icon name="undo" size={18} />
            </button>
            <button
                class="toolbar-btn"
                disabled={!toolbarActive || isPreview || redoStack.length === 0}
                onclick={redo}
                aria-label="Redo"
            >
                <Icon name="redo" size={18} />
            </button>
        </div>

        {#if !isPreview}
        <div class="textarea-wrapper">
            <textarea
                class="canvas"
                bind:value={rawText}
                bind:this={textareaRef}
                oninput={onTextareaInput}
                onfocus={onTextareaFocus}
            ></textarea>
            {#if !rawText}
            <div class="placeholder-helper">
                <p>Paste or create a chord sheet</p>
                <p>Sources: <a href="https://www.ultimate-guitar.com" target="_blank">Ultimate Guitar</a>, <a href="https://chordu.com" target="_blank">Chordu</a>, <a href="https://www.e-chords.com" target="_blank">E-Chords</a></p>
                <p>Add manual chords in this format:</p>
                <p>Let it [Am]be, Let it [G]be</p>
            </div>
            {/if}
        </div>
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
            <button class="btn-pill btn-pill-primary" onclick={chordIt}>Chord It</button>
            <div class="edit-preview-toggle" class:disabled={!hasContent}>
                <button
                    type="button"
                    class="toggle-segment"
                    class:active={!isPreview}
                    disabled={!hasContent}
                    onclick={() => isPreview && togglePreview()}
                >
                    Edit
                </button>
                <button
                    type="button"
                    class="toggle-segment"
                    class:active={isPreview}
                    disabled={!hasContent}
                    onclick={() => !isPreview && togglePreview()}
                >
                    Preview
                </button>
            </div>
        </div>

        {#if hasParsedOnce}
        <div class="transpose">
            <span class="transpose-heading">Transpose</span>
            <div class="transpose-row">
                <div class="key-selector">
                    <button class="chevron-btn" onclick={transposeDown} aria-label="Transpose down">
                        <Icon name="chevron-down" size={18} color="#ffffff" />
                    </button>
                    <span class="key-display">{liveCurrentKey}</span>
                    <span class="key-divider"></span>
                    <span class="key-steps">{transposeOffsetLabel}</span>
                    <button class="chevron-btn" onclick={transposeUp} aria-label="Transpose up">
                        <Icon name="chevron-up" size={18} color="#ffffff" />
                    </button>
                </div>
                <div class="chord-progression">
                    {#each liveChordProgression as chord (chord)}
                        <span class="chord-chip">{chord}</span>
                    {/each}
                </div>
            </div>
            <div class="original-key-row">
                <span class="original-key-text">Original Key: {originalKey}</span>
                <span class="original-key-sep">|</span>
                <button class="btn-link" onclick={revertTranspose} disabled={transposeOffset === 0}>Revert</button>
            </div>
        </div>

        {#if chordList.length > 0}
        <div class="keyboards">
            <KeyboardGrid chordList={liveChordProgression} />
        </div>
        <hr />
        {/if}

        {#if editingSongId}
        <div class="delete-section">
            <button class="btn-danger" onclick={requestDelete}>Delete Chord Sheet</button>
        </div>

        <hr />
        {/if}
        {/if}

        <hr />

        <div class="import-export">
            <h3>Import & Export Chord Library</h3>
            <p>Save all chord sheets to share between devices</p>
            <div class="buttons">
                <button class="toolbar-btn-style" onclick={handleExport}>Export</button>
                <button class="toolbar-btn-style" onclick={triggerImport}>Import</button>
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
			<p>You have unsaved changes that will be lost.</p>
			<div class="modal-actions">
				<button onclick={cancelClose}>Keep editing</button>
				<button class="primary" onclick={confirmClose}>Close</button>
			</div>
		</div>
	</div>
	{/if}

	{#if showDeleteModal}
	<div class="modal-overlay">
		<div class="delete-modal-content">
			<p>Delete chord sheet? This cannot be undone.</p>
			<div class="delete-modal-actions">
				<button class="btn-modal" onclick={cancelDelete}>Cancel</button>
				<button class="btn-modal btn-modal-danger" onclick={confirmDelete}>Delete</button>
			</div>
		</div>
	</div>
	{/if}
</Drawer>

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-md);
	}
	.btn-pill {
		height: 36px;
		padding: 0 var(--space-md);
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--bg-main);
		color: var(--text-secondary);
		font-weight: 600;
		font-size: var(--text-sm, 0.9em);
		cursor: pointer;
	}
	.btn-pill-save {
		color: var(--text-secondary);
		border-color: var(--color-border);
	}
	.btn-pill-save.active {
		color: var(--accent-brand);
		border-color: var(--accent-brand);
	}
	.btn-pill-save:disabled {
		cursor: default;
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
    .form-group input {
        height: 44px;
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
    .toolbar-btn {
        height: 36px;
        min-width: 44px;
        padding: 0 var(--space-sm);
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background: var(--bg-main);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #cccccc;
        cursor: not-allowed;
    }
    .toolbar-btn:not(:disabled) {
        color: #777777;
        cursor: pointer;
    }
    .toolbar-btn:not(:disabled):hover {
        border-color: #777777;
    }
    .toolbar-btn:disabled {
        opacity: 1;
    }
    .toolbar-btn-style {
        height: 36px;
        padding: 0 var(--space-sm);
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background: var(--bg-main);
        color: #777777;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .toolbar-btn-style:hover {
        border-color: #777777;
    }
    .textarea-wrapper {
        position: relative;
        width: 100%;
    }
    .canvas {
    	width: 100%;
    	min-height: 200px;
    	resize: vertical;
    	font-family: var(--font-family);
    	white-space: pre;
    	background: var(--bg-main);
    }
    .placeholder-helper {
        position: absolute;
        top: var(--space-sm);
        left: var(--space-sm);
        pointer-events: none;
        color: var(--text-secondary);
        font-size: 0.9em;
        line-height: 1.5;
    }
    .placeholder-helper p {
        margin: 0 0 var(--space-xs) 0;
    }
    .placeholder-helper a {
        color: var(--text-secondary);
        text-decoration: underline;
        pointer-events: auto;
    }
    .preview-canvas {
    	min-height: 200px;
    	background: var(--bg-surface);
    	padding: var(--space-sm);
    	border-radius: var(--radius-sm);
    	border: 1px solid var(--color-border);
    	font-family: var(--font-family);
    	overflow-x: auto;
    }
    .empty-preview {
    	color: var(--text-secondary);
    	margin: 0;
    }
    .preview-line {
    	display: flex;
    	flex-direction: column;
    	margin-bottom: var(--space-sm);
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
    	font-weight: 400;
    	white-space: pre;
    	line-height: 1.3;
    }
    .actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
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
    .btn-pill-primary {
        background-color: var(--accent-brand);
        color: white;
        border-color: var(--accent-brand);
    }
    .edit-preview-toggle {
        display: flex;
        height: 36px;
        border: 1px solid var(--accent-brand);
        border-radius: var(--radius-sm);
        overflow: hidden;
        margin-left: auto;
    }
    .edit-preview-toggle.disabled {
        border-color: var(--color-border);
    }
    .toggle-segment {
        height: 100%;
        padding: 0 var(--space-md);
        border: none;
        background: var(--bg-main);
        color: var(--accent-brand);
        font-weight: 600;
        font-size: var(--text-sm, 0.9em);
        cursor: pointer;
    }
    .toggle-segment.active {
        background: var(--accent-brand);
        color: white;
        cursor: default;
    }
    .edit-preview-toggle.disabled .toggle-segment {
        color: var(--text-secondary);
        background: var(--bg-main);
        cursor: not-allowed;
    }
    .edit-preview-toggle.disabled .toggle-segment.active {
        background: var(--color-border);
        color: var(--text-secondary);
    }
    button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .delete-section {
        display: flex;
        justify-content: center;
    }
    .btn-danger {
        color: var(--color-danger, #d9383a);
        background: none;
        border: none;
        cursor: pointer;
        font-weight: 400;
        font-size: var(--text-base);
    }
    .transpose {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
    }
    .transpose-heading {
        font-size: var(--text-h3);
        font-weight: 400;
        color: var(--text-primary);
        text-align: left;
    }
    .transpose-row {
        display: flex;
        align-items: stretch;
        gap: var(--space-sm);
        flex-wrap: wrap;
        width: 100%;
    }
    .key-selector {
        flex: 1 1 auto;
        min-width: 140px;
        display: flex;
        align-items: stretch;
        height: 36px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--bg-main);
        overflow: hidden;
    }
    .chevron-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        flex: 0 0 36px;
        height: 100%;
        background: #777777;
        color: #ffffff;
        border-radius: 0;
    }
    .chevron-btn:hover {
        background: #666666;
    }
    .key-display {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1 1 auto;
        min-width: 0;
        padding: 0 var(--space-sm);
        background: var(--bg-surface);
        color: var(--accent-brand);
        font-weight: 700;
        font-size: var(--text-h3);
        white-space: nowrap;
    }
    .key-divider {
        flex: 0 0 1px;
        width: 1px;
        background: var(--color-border);
    }
    .key-steps {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1 1 auto;
        min-width: 0;
        padding: 0 var(--space-sm);
        background: var(--bg-surface);
        color: var(--text-secondary);
        font-size: var(--text-sm, 0.9em);
        white-space: nowrap;
    }
    .chord-progression {
        display: flex;
        flex-wrap: wrap;
        align-content: stretch;
        gap: var(--space-xs);
        flex: 0 0 auto;
    }
    .chord-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 36px;
        box-sizing: border-box;
        background: var(--bg-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 0 var(--space-sm);
        font-weight: 600;
    }
    .original-key-row {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: var(--space-xs);
        color: var(--text-secondary);
        font-size: var(--text-sm, 0.9em);
    }
    .original-key-sep {
        color: var(--color-border);
    }
    .btn-link {
        color: var(--accent-brand);
        background: none;
        border: none;
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
        font-size: inherit;
    }
    .keyboards h3 {
        text-align: center;
    }
    hr {
        border: none;
        border-top: 1px solid var(--color-separator);
        margin: var(--space-md) 0;
    }
    .import-export .buttons {
        display: flex;
        gap: var(--space-md);
    }
    .import-export .buttons .toolbar-btn-style {
        flex: 1 1 0;
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
	.delete-modal-content {
		background: var(--bg-main);
		border-radius: var(--radius-md);
		padding: var(--space-lg);
		width: 100%;
		max-width: 340px;
		box-shadow: var(--shadow-lg);
	}
	.delete-modal-content p {
		margin: 0 0 var(--space-lg) 0;
		text-align: center;
	}
	.delete-modal-actions {
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
	.btn-modal.btn-modal-danger {
		border-color: #d9383a;
		background: #d9383a;
		color: #ffffff;
	}
</style>
