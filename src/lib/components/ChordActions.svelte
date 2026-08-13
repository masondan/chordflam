<script lang="ts">
	import Drawer from './Drawer.svelte';
	import KeyboardGrid from './KeyboardGrid.svelte';
	import Icon from './icons/Icon.svelte';
	import { parseSong, formatParsedLineForDisplay, extractChordOccurrences } from '$lib/utils/parser';
	import { transposeRawText, transposeChord, semitoneDistance } from '$lib/utils/transpose';
	import { detectKey, isMajorEdit } from '$lib/utils/keyDetection';
	import { extractYouTubeId, getEmbedUrl } from '$lib/utils/videoEmbed';
	import {
		getSong,
		saveSong,
		deleteSong,
		getSettings,
		updateSettings,
		exportLibrary,
		importLibrary,
		addVideoLink,
		updateVideoLink,
		deleteVideoLink,
		type ParsedLine,
		type Song,
		type VideoLink
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
	let showTitleRequiredModal = $state(false);
	let showFixKeyModal = $state(false);
	let fixKeyInput = $state('');

	// Import/export
	let importFileInput: HTMLInputElement | undefined = $state();
	let importMessage = $state('');

	// --- Video Links (see AGENTS.md / plan handoff §Video Links) ---
	// For an existing (already-saved) song, video links are written to the
	// DB immediately on add/edit/delete — independent of the rawText
	// dirty-flag/"Chord It" commit flow, same as toggleFavourite. For a
	// brand-new, not-yet-saved song (Add mode), there is no row to write to
	// yet, so links are held here in local state and persisted together
	// with the song on its first successful save (see persist()).
	let videoLinks = $state<VideoLink[]>([]);
	let videoUrlInput = $state('');
	let videoTitleInput = $state('');
	let videoUrlValid = $state<boolean | null>(null); // null = empty/untouched, true/false = validated
	let editingVideoLinkId = $state<string | null>(null); // set when editing an existing entry's title
	let openVideoPreviewId = $state<string | null>(null); // only one preview open at a time, within Chord Actions
	let videoSectionOpen = $state(false); // collapsed dropdown by default — see AGENTS.md UI declutter note

	function validateVideoUrl() {
		if (editingVideoLinkId) return; // URL is fixed/read-only once an entry is being edited
		const value = videoUrlInput.trim();
		if (!value) {
			videoUrlValid = null;
			return;
		}
		try {
			new URL(value);
			videoUrlValid = true;
		} catch {
			videoUrlValid = false;
		}
	}

	// Any edit to the URL text invalidates a prior validation result — the
	// chevron reverts to its "active, not yet confirmed" state until tapped
	// again. Also clears the "URL failed" message.
	function onVideoUrlInput() {
		if (editingVideoLinkId) return;
		videoUrlValid = null;
	}

	function resetVideoInputs() {
		videoUrlInput = '';
		videoTitleInput = '';
		videoUrlValid = null;
		editingVideoLinkId = null;
	}

	async function confirmVideoLink() {
		const title = videoTitleInput.trim();
		if (!title) return;

		if (editingVideoLinkId) {
			// Editing an existing entry — URL is fixed, only the title changes.
			const linkId = editingVideoLinkId;
			videoLinks = videoLinks.map((l) => (l.id === linkId ? { ...l, title } : l));
			if (workingSongId) {
				await updateVideoLink(workingSongId, linkId, { title });
			}
		} else {
			if (videoUrlValid !== true) return;
			const newLink: VideoLink = {
				id: crypto.randomUUID(),
				url: videoUrlInput.trim(),
				title
			};
			videoLinks = [newLink, ...videoLinks];
			if (workingSongId) {
				await addVideoLink(workingSongId, newLink);
			}
			// If this is a brand-new/unsaved song, newLink simply stays in
			// local `videoLinks` state and rides along with the next persist().
		}

		// Video links save independently of the rawText dirty/"Chord It" commit
		// flow (see AGENTS.md / plan handoff), so `dirty` never reflects this
		// change. Save & Close must still activate so the user has a clear,
		// reassuring way to confirm the change and leave the drawer.
		hasEverBeenModified = true;

		resetVideoInputs();
	}

	async function deleteVideoLinkRow(id: string) {
		videoLinks = videoLinks.filter((l) => l.id !== id);
		if (openVideoPreviewId === id) openVideoPreviewId = null;
		if (editingVideoLinkId === id) resetVideoInputs();
		if (workingSongId) {
			await deleteVideoLink(workingSongId, id);
		}
		hasEverBeenModified = true;
	}

	function startEditVideoLink(link: VideoLink) {
		videoUrlInput = link.url;
		videoTitleInput = link.title;
		videoUrlValid = true; // URL is fixed/pre-validated, shown read-only
		editingVideoLinkId = link.id;
	}

	function cancelEditVideoLink() {
		resetVideoInputs();
	}

	function toggleVideoPreview(id: string) {
		openVideoPreviewId = openVideoPreviewId === id ? null : id;
	}

	function getVideoEmbedUrl(url: string): string | null {
		const ytId = extractYouTubeId(url);
		return ytId ? getEmbedUrl(ytId) : null;
	}

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

	// Once true for this drawer session, stays true — even after "Chord It"
	// commits and `dirty` goes back to false. "Save & Close" uses this (not
	// `dirty`) so that tapping Chord It to preview a change never leaves the
	// user stuck with no way to close the drawer: the button stays active as
	// both a reassurance and a working close action, even when there is
	// technically nothing left to save.
	let hasEverBeenModified = $state(false);

	$effect(() => {
		if (dirty) {
			hasEverBeenModified = true;
		}
	});

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
		videoLinks = song.videoLinks ?? [];
		resetVideoInputs();
		openVideoPreviewId = null;

		committed = { title, artist, rawText };
		hasParsedOnce = true;
		isPreview = true;
		parseError = false;
		history = [];
		redoStack = [];
		toolbarActive = true;
		hasEverBeenModified = false;
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
		videoLinks = [];
		resetVideoInputs();
		openVideoPreviewId = null;

		committed = { title: '', artist: '', rawText: '' };
		hasParsedOnce = false;
		isPreview = false;
		parsedLines = [];
		chordList = [];
		parseError = false;
		history = [];
		redoStack = [];
		toolbarActive = false;
		hasEverBeenModified = false;
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
		if (!hasEverBeenModified) return;
		if (!title.trim()) {
			showTitleRequiredModal = true;
			return;
		}
		if (dirty) {
			// There's uncommitted work (edits and/or a pending transpose preview
			// that Chord It hasn't baked in yet) — commit it via the normal
			// Chord It path before closing.
			await chordIt();
			if (parseError || saveError) return;
		}
		// If not dirty, everything was already committed by a prior Chord It —
		// Save & Close just closes the drawer (see note on hasEverBeenModified).
		onClose();
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
		if (!dirty) return;

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
		// detectKey needs every chord *occurrence* (with repeats), not the
		// deduplicated chordList, since frequency is its primary signal.
		if (!hadKeyBefore) {
			// First-ever parse for this song (new song, or first Chord It on an
			// import that had no key yet): detect fresh. originalKey is brand new,
			// so any prior transpose dialling is meaningless — reset to 0.
			originalKey = detectKey(extractChordOccurrences(parsedLines));
			currentKey = originalKey;
			transposeOffset = 0;
			appliedOffset = 0;
		} else {
			const major = isMajorEdit(previousChordList, chordList);
			if (major) {
				// originalKey is being replaced — any transpose distance from the
				// *old* original is meaningless now, so reset to 0 as well.
				originalKey = detectKey(extractChordOccurrences(parsedLines));
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
			dateAdded: dateAdded || new Date().toISOString(),
			videoLinks
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

	function dismissTitleRequiredModal() {
		showTitleRequiredModal = false;
	}

	function openFixKeyModal() {
		fixKeyInput = originalKey;
		showFixKeyModal = true;
	}

	function cancelFixKey() {
		showFixKeyModal = false;
		fixKeyInput = '';
	}

	async function confirmFixKey() {
		const newKey = fixKeyInput.trim().toUpperCase();
		if (!newKey) {
			cancelFixKey();
			return;
		}
		originalKey = newKey;
		showFixKeyModal = false;
		fixKeyInput = '';
		// Mark as modified so Save & Close stays active
		hasEverBeenModified = true;
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
			// Close the drawer after a brief delay so the user sees the success message,
			// which triggers onClose in the parent and refreshes the song library.
			setTimeout(() => onClose(), 1500);
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
		<button
			class="btn-pill btn-pill-save"
			class:active={hasEverBeenModified}
			disabled={!hasEverBeenModified}
			onclick={saveAndClose}
		>
			Save &amp; Close
		</button>
	</div>
	<div class="content">
        <div class="form-group">
            <label for="title">Song Title <span class="input-hint">(Required)</span></label>
            <input type="text" id="title" bind:value={title} />
        </div>
        <div class="form-group">
            <label for="artist">Artist/Info <span class="input-hint">(Optional)</span></label>
            <input type="text" id="artist" bind:value={artist} />
        </div>

        <div class="video-dropdown">
            <button
                type="button"
                class="video-dropdown-toggle"
                onclick={() => (videoSectionOpen = !videoSectionOpen)}
                aria-expanded={videoSectionOpen}
            >
                <span class="video-dropdown-label">Video <span class="input-hint">(Optional)</span></span>
                <Icon name={videoSectionOpen ? 'chevron-up' : 'chevron-down'} size={18} color="var(--text-secondary)" />
            </button>
            <hr class="video-dropdown-sep" />

            {#if videoSectionOpen}
            <div class="video-dropdown-content">
                <div class="form-group">
                    <div class="video-url-row">
                        <input
                            type="text"
                            id="video-url"
                            class="video-url-input"
                            class:readonly-url={!!editingVideoLinkId}
                            placeholder="Add URL: https://www.youtube.com/..."
                            bind:value={videoUrlInput}
                            readonly={!!editingVideoLinkId}
                            oninput={onVideoUrlInput}
                        />
                        <button
                            type="button"
                            class="video-url-confirm-btn"
                            class:active={!!videoUrlInput.trim() && videoUrlValid !== true}
                            class:success={videoUrlValid === true}
                            disabled={!videoUrlInput.trim() || videoUrlValid === true}
                            onclick={validateVideoUrl}
                            aria-label={videoUrlValid === true ? 'URL validated' : 'Validate URL'}
                        >
                            <Icon name={videoUrlValid === true ? 'check' : 'chevron-right'} size={20} />
                        </button>
                    </div>
                    {#if videoUrlValid === false}
                        <p class="video-url-error">URL failed. Please try again.</p>
                    {/if}
                </div>

                <div class="form-group">
                    <div class="video-title-row">
                        <input
                            type="text"
                            id="video-title"
                            placeholder="Video Title"
                            bind:value={videoTitleInput}
                            disabled={videoUrlValid !== true}
                        />
                        <button
                            type="button"
                            class="video-confirm-btn"
                            class:active={videoUrlValid === true && !!videoTitleInput.trim()}
                            disabled={videoUrlValid !== true || !videoTitleInput.trim()}
                            onclick={confirmVideoLink}
                            aria-label={editingVideoLinkId ? 'Save video title' : 'Add video link'}
                        >
                            <Icon name="chevron-right" size={20} />
                        </button>
                    </div>
                    {#if editingVideoLinkId}
                        <button type="button" class="video-cancel-edit" onclick={cancelEditVideoLink}>Cancel</button>
                    {/if}
                </div>

                {#if videoLinks.length > 0}
                <div class="video-links-list">
                    {#each videoLinks as link (link.id)}
                        <div class="video-link-row">
                            <Icon name="video" size={18} color="var(--text-secondary)" />
                            <span class="video-link-title">{link.title}</span>
                            <button class="video-link-icon-btn" aria-label="Delete video link" onclick={() => deleteVideoLinkRow(link.id)}>
                                <Icon name="trash" size={18} color="var(--text-secondary)" />
                            </button>
                            <button class="video-link-icon-btn" aria-label="Edit video link" onclick={() => startEditVideoLink(link)}>
                                <Icon name="edit" size={18} color="var(--text-secondary)" />
                            </button>
                            <button class="video-link-icon-btn" aria-label={openVideoPreviewId === link.id ? 'Hide preview' : 'View preview'} onclick={() => toggleVideoPreview(link.id)}>
                                <Icon name={openVideoPreviewId === link.id ? 'view-hide' : 'view'} size={18} color="var(--text-secondary)" />
                            </button>
                        </div>
                        {#if openVideoPreviewId === link.id}
                            <div class="video-preview">
                                {#if getVideoEmbedUrl(link.url)}
                                    <iframe
                                        src={getVideoEmbedUrl(link.url)}
                                        title={link.title}
                                        frameborder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowfullscreen
                                    ></iframe>
                                {:else}
                                    <p class="video-preview-fallback">This link can't be previewed here — it will still be saved.</p>
                                {/if}
                            </div>
                        {/if}
                    {/each}
                </div>
                {/if}
            </div>
            {/if}
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
                <p>Paste or create a chord chart here</p>
                <p>Add manual chords in this format:</p>
                <p>Let it [Am]be, Let it [G]be</p>
            </div>
            <div class="placeholder-sources">
                Sources: <a href="https://www.ultimate-guitar.com" target="_blank">Ultimate Guitar</a>, <a href="https://chordu.com" target="_blank">Chordu</a>, <a href="https://www.e-chords.com" target="_blank">E-Chords</a>
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
            <button class="btn-pill btn-pill-primary" disabled={!dirty} onclick={chordIt}>Chord It</button>
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
                <span class="original-key-sep">|</span>
                <button class="btn-link" onclick={openFixKeyModal} disabled={!hasParsedOnce}>Fix</button>
            </div>
        </div>

        {#if chordList.length > 0}
        <div class="keyboards">
            <KeyboardGrid chordList={liveChordProgression} />
        </div>
        {/if}

        {#if editingSongId}
        <div class="delete-section">
            <button class="btn-danger" onclick={requestDelete}>Delete Chord Sheet</button>
        </div>
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

	{#if showTitleRequiredModal}
	<div class="modal-overlay">
		<div class="delete-modal-content">
			<p>Add a Song Title before saving</p>
			<div class="delete-modal-actions">
				<button class="btn-modal" onclick={dismissTitleRequiredModal}>Cancel</button>
				<button class="btn-modal" onclick={dismissTitleRequiredModal}>Got it</button>
			</div>
		</div>
	</div>
	{/if}

	{#if showFixKeyModal}
	<div class="modal-overlay">
		<div class="delete-modal-content">
			<p>If ChordFlam made a mistake, add the correct key for this song. It won't change the chord sheet.</p>
			<input
				type="text"
				class="fix-key-input"
				bind:value={fixKeyInput}
				placeholder="e.g., C, D, Em, F#m"
				maxlength="4"
			/>
			<div class="delete-modal-actions">
				<button class="btn-modal" onclick={cancelFixKey}>Cancel</button>
				<button class="btn-modal" onclick={confirmFixKey}>Change Key</button>
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
    .input-hint {
        color: #aaaaaa;
        font-weight: 400;
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
    	font-family: var(--font-family-mono);
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
    .placeholder-sources {
        position: absolute;
        bottom: var(--space-md);
        left: var(--space-sm);
        right: var(--space-sm);
        pointer-events: none;
        color: #aaaaaa;
        font-size: 0.85em;
        line-height: 1.4;
    }
    .placeholder-sources a {
        color: #aaaaaa;
        text-decoration: underline;
        pointer-events: auto;
    }
    .preview-canvas {
    	min-height: 200px;
    	background: var(--bg-surface);
    	padding: var(--space-sm);
    	border-radius: var(--radius-sm);
    	border: 1px solid var(--color-border);
    	font-family: var(--font-family-mono);
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
    	font-family: var(--font-family-mono);
    }
    .lyric-row {
    	font-weight: 400;
    	white-space: pre;
    	line-height: 1.3;
    	font-family: var(--font-family-mono);
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
    .btn-pill-primary:disabled {
        background-color: var(--color-border);
        border-color: var(--color-border);
        color: var(--text-secondary);
        opacity: 1;
        cursor: not-allowed;
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
		margin-top: var(--space-md);
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
    .import-export h3 {
        margin: 0 0 var(--space-xs) 0;
        font-size: var(--text-h3);
        font-weight: 400;
        color: var(--text-primary);
    }
    .import-export > p {
        font-size: var(--text-sm, 0.9em);
        color: var(--text-secondary);
        margin: 0 0 var(--space-md) 0;
    }
    .import-message {
        font-size: 0.9em;
        color: var(--text-secondary);
    }
    .video-dropdown {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
    }
    .video-dropdown-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        font: inherit;
        color: var(--text-primary);
    }
    .video-dropdown-label {
        font-size: var(--text-base);
    }
    .video-dropdown-sep {
        border: none;
        border-top: 1px solid var(--color-separator);
        margin: 0;
    }
    .video-dropdown-content {
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
    }
    .video-url-row {
        display: flex;
        align-items: stretch;
        gap: var(--space-sm);
    }
    .video-url-input {
        flex: 1 1 auto;
        min-width: 0;
        text-overflow: ellipsis;
    }
    .video-url-input:focus {
        border-color: var(--accent-brand);
        outline: none;
    }
    .video-url-input.readonly-url {
        background: var(--bg-surface);
        color: var(--text-secondary);
        cursor: default;
    }
    .video-url-confirm-btn {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--bg-main);
        color: var(--color-border);
        cursor: not-allowed;
    }
    .video-url-confirm-btn.active {
        color: var(--accent-brand);
        border-color: var(--accent-brand);
        cursor: pointer;
    }
    .video-url-confirm-btn.success {
        color: var(--accent-brand);
        border-color: var(--accent-brand);
        cursor: default;
    }
    .video-url-error {
        margin: 0;
        font-size: 0.85em;
        color: #9b2c26;
    }
    .video-title-row {
        display: flex;
        align-items: stretch;
        gap: var(--space-sm);
    }
    .video-title-row input {
        flex: 1 1 auto;
        min-width: 0;
        background: var(--bg-main);
    }
    .video-title-row input:disabled {
        cursor: not-allowed;
        background: var(--bg-main);
        color: var(--text-secondary);
        border-color: var(--color-border);
    }
    .video-title-row input:not(:disabled) {
        border-color: var(--accent-brand);
    }
    .video-title-row input:not(:disabled):focus {
        outline: none;
        border-color: var(--accent-brand);
    }
    .video-confirm-btn {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--bg-main);
        color: var(--color-border);
        cursor: not-allowed;
    }
    .video-confirm-btn.active {
        color: var(--accent-brand);
        border-color: var(--accent-brand);
        cursor: pointer;
    }
    .video-confirm-btn:disabled {
        color: var(--color-border);
        border-color: var(--color-border);
        cursor: not-allowed;
    }
    .video-cancel-edit {
        margin-top: var(--space-xs);
        font-size: 0.85em;
        color: var(--accent-brand);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        text-align: left;
        align-self: flex-start;
    }
    .video-links-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
    }
    .video-link-row {
    	display: flex;
    	align-items: center;
    	gap: var(--space-sm);
    	padding: var(--space-sm) var(--space-md);
    	margin-bottom: var(--space-sm);
    	background: var(--bg-surface);
    	border-radius: var(--radius-md);
    }
    .video-link-title {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--text-base);
    }
    .video-link-icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        line-height: 0;
        flex-shrink: 0;
    }
    .video-preview {
        margin: 0 0 var(--space-sm) 0;
    }
    .video-preview iframe {
        width: 100%;
        aspect-ratio: 16 / 9;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
    }
    .video-preview-fallback {
        margin: 0;
        padding: var(--space-sm);
        color: var(--text-secondary);
        font-size: 0.9em;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--bg-surface);
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
		border-radius: var(--radius-md);
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
	.fix-key-input {
		width: 100%;
		padding: var(--space-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-family: inherit;
		font-size: var(--text-base);
		box-sizing: border-box;
		margin-bottom: var(--space-lg);
	}
</style>
