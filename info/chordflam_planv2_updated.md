# ChordFlam — Unified Build Plan (v2 Consolidated)

> **Status of this document:** v2 supersedes v1 entirely. It incorporates the reworked drawer architecture (Chord Reader / Chord Actions split), the bracket-notation editing model, mini-keyboard chord diagrams, and the renamed page/drawer structure agreed in the UI/UX review pass. Logic, data model, and architecture decisions below are intended to be stable from here; fine-grained visual polish may still shift in implementation.

**Stack:** SvelteKit (TypeScript) · Cloudflare Pages · IndexedDB via Dexie.js · Mobile-first, styled in the Flam visual tradition
**Domain:** chordflam.flamtools.com
**Not part of the Flam journalism-training suite.** This is a personal tool built for a ten-year-old learning piano, reusing Flam's build patterns and styling conventions for consistency and developer familiarity — not for journalism training purposes.
**Scope of v1 build:** Single-user, offline-first, personal chord-sheet archive with transpose, per-song display customisation, mini-keyboard chord diagrams, and JSON export/import. No scraping, no external chord APIs, no server-side storage, no accounts.

---

## 0. Design Tokens (PromptFlam Reference)

Extracted from the PromptFlam design system:

- **Colour palette**:
  - Primary/Brand: `--accent-brand` (#5422b0)
  - Secondary/Highlight: `--color-highlight` (#F0E6F7)
  - Text: `--text-primary` (#1f1f1f), `--text-secondary` (#777777)
  - Borders/Separators: `--color-border` (#e0e0e0), `--color-separator` (#e0e0e0)
  - Backgrounds: `--bg-main` (#ffffff), `--bg-surface` (#f8f8f8), `--bg-surface-dark` (#efefef)
- **Typography**:
  - Font family: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
  - Sizes: Base (`1.125rem` / 18px), H3 (`1.125rem`), H2 (`1.25rem`), H1 (`1.5rem`)
  - Line heights: `1.5` for body, `1.2` for headings
- **Spacing scale**: XS (`4px`), SM (`8px`), MD (`16px`), LG (`24px`), XL (`32px`)
- **Border radius scale**: Small (`6px`), Base (`12px`), Large (`16px`), Full (`9999px`)
- **Z-index layers**: Header (`100`), Input Drawer (`90`), Overlay (`200`), Drawer (`210`), Selection Menu (`220`)
- **Responsive breakpoints**: Constrained to `--app-max-width` (480px) and centered at `>= 768px`.
- **Shadows/elevation**:
  - Small: `0 1px 2px rgba(0, 0, 0, 0.05)`
  - Medium: `0 4px 6px rgba(0, 0, 0, 0.07)`
  - Large: `0 10px 15px rgba(0, 0, 0, 0.1)`
  - Input: `0 -4px 12px rgba(0, 0, 0, 0.05)`
- **Six chord colour presets**:
  - Brand Purple `#6E36D1`
  - Coral Red `#D9383A`
  - Sapphire Blue `#1652E2`
  - Emerald Green `#0D8351`
  - Amber Orange `#C85A00`
  - Charcoal Slate `#333C4E`

---

## 1. Naming — Page & Drawer Structure

The app is one page and two full-screen drawers. These names are final and used throughout this document and in code (component/route naming should follow them):

| Name                               | Role                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| **Chord Library** (`chordLibrary`) | Home page — the song list                                                    |
| **Chord Reader** (`chordReader`)   | Full-screen drawer — read-only display of a song for playing/following along |
| **Chord Actions** (`chordActions`) | Full-screen drawer — add, edit, transpose, delete, import/export             |

There is no separate "Import Drawer" or "Edit Drawer" — both are the single **Chord Actions** drawer, distinguished only by whether it opens with an existing song loaded (Edit) or empty (Add). This supersedes v1's "Import/Edit Drawer" naming but keeps the same underlying single-component principle.

---

## 2. Confirmed Product Decisions

These are settled and should not be re-litigated without a deliberate scope change:

- **Chord Reader is strictly read-only.** No editing, no transpose control, lives there. Its only interactive elements are display toggles (text size, chord colour, keyboard show/hide) and navigation (Back, Edit).
- **All editing, including transpose, lives in Chord Actions.** Tapping Edit from either Chord Library or Chord Reader opens Chord Actions for that song.
- **Transposing in Chord Actions and tapping "Chord It" updates `currentKey` everywhere** — Chord Library card, Chord Reader header, and the Chord Reader mini-keyboard grid all reflect the new key once saved.
- **The editable and canonical text format is bracket notation.** `rawText` **is** the bracket-notation string (e.g. `[Am]Twinkle [C]twinkle [G]little star`) — there is no separate structured format the user edits against. `parsedLines` and `chordList` are always derived from `rawText` by the parser, regenerated on Save/"Chord It" only, never on every keystroke.
- **Font size and chord colour are per-song settings that behave as a rolling global default.** Each song stores its own `fontSize` and `chordColour`. Changing them while viewing a song (in Chord Reader) updates that song's stored values _and_ becomes the default applied to the next song opened (and to newly imported songs), until changed again.
- **Dark/light mode is deferred to a future update.** v1 is light background only — no theme toggle, no theme storage. See §9.
- **Transposed key persists per song**, with one exception: **editing preserves `currentKey` unless the edit meaningfully changes the chord structure**, in which case key detection re-runs and `currentKey` resets to the newly detected original key. See §5 for the detection rule.
- **Autoscroll is out of scope for v1.**
- **No duplicate detection on import.** Import adds/updates by internal id only.
- **Delete uses undo, not a hard confirm dialog** (see §8) — implemented for v1 as a temporary UI measure, expected to change in the next UX pass.
- **Mini-keyboard chord diagrams are computed, not stored.** No new data model fields are required — diagrams are generated on the fly from `chordList` using the `tonal` library (see §6).

---

## 3. Data Model

```ts
Song {
  id: string                  // uuid
  title: string                // required
  artist: string | null

  rawText: string               // canonical bracket-notation text — the single source of truth for editing
  parsedLines: ParsedLine[]     // cached structured output from parser, derived from rawText on Save
  chordList: string[]           // derived from parsedLines at parse time, cached for display

  originalKey: string | null    // detected at import, re-detected only on major edit (§5)
  currentKey: string            // last-viewed/transposed key; persists per song

  fontSize: number              // per-song, seeded from the last-used default on import
  chordColour: string           // per-song, seeded from the last-used default on import

  isFavourite: boolean
  dateAdded: string             // ISO

  editHistory: string[]         // NOT persisted long-term — see §7.6 undo/redo note
}

AppSettings {
  defaultFontSize: number         // rolling default, seeded into new songs
  defaultChordColour: string      // rolling default, seeded into new songs — one of the six presets, see §7.3
}
```

**Notes**

- `rawText` is bracket notation, full stop. There is no second "editable structured" representation — this collapses what earlier drafts treated as two formats (raw text vs. an editable preview) into one, removing an entire class of sync bugs between "what's in the edit box" and "what's rendered."
- `parsedLines` and `chordList` are regenerated only on explicit "Chord It" / Save, never on every keystroke.
- `editHistory` is an in-memory undo/redo stack scoped to a single Chord Actions session — it is **not** persisted to IndexedDB, and resets when the drawer closes.
- Mini-keyboard diagrams are **not** stored anywhere in this model. They are computed at render time from `chordList` (or from the current transposed chord set while previewing in Chord Actions). See §6.

---

## 4. Primary User Journey

```
Launch app
  ↓
Chord Library: All Songs (alphabetical, searchable, favourite-filterable) — Recent Songs deferred, see §9
  ↓
Tap View icon on a song → Chord Reader (read-only)
  ↓
Follow along while playing · toggle text size / chord colour / keyboard grid
  ↓
Tap Edit → Chord Actions (pre-filled) → make changes, including transpose → Chord It / Save → returns to Chord Reader

— separately —

Tap [Add Chords] on Chord Library → Chord Actions (empty)
  ↓
Paste chord sheet (bracket notation or raw UG-style paste) → Chord It (parses)
  ↓
Preview becomes active — read-only rendered view
  ↓
Enter/confirm Title, Artist — Original Key auto-detected and displayed, read-only
  ↓
Close drawer → song appears in Recent + All Songs on Chord Library
```

---

## 5. Chord Actions Drawer (single shared component)

This is the drawer that handles Add, Edit, Preview, Transpose, Delete, and Import/Export. One Svelte component (e.g. `ChordActions.svelte`), driven by a single prop/state value:

```ts
editingSongId: string | null;
```

- `null` → "Add Song" mode: empty form, closing/saving creates a new `Song`.
- `<id>` → "Edit Song" mode: form pre-filled from the existing `Song`.

Both entry points route to the same component instance — no duplicated markup or parsing logic.

### 5.1 Layout, top to bottom

```
< Back                                  (top left, returns to Chord Library or Chord Reader)
Title input                             (required)
Artist input                            (optional)

[Chord It] button    [Preview | Edit toggle]   ← toggle inactive until first parse
┌─────────────────────────────────────────┐
│  Edit/Preview canvas (see 5.2)           │
└─────────────────────────────────────────┘
Toolbar: Add Chord · b (flat) · # (sharp) · Cut · Copy      Undo / Redo (bottom right of canvas)

── Transpose ──
[▼]   E  -2   [▲]        Am  C  F  G   (chord progression, current key)
Original Key: G     Revert

── Mini-keyboards ──
(2×2 grid on mobile with swipe/tap paging if more than 4 unique chords; single row on
 desktop/iPad if space allows — see §6)

Delete Chord                            (centred, red text, confirm-on-tap — see §8)

── Import & Export Chord Library ──
Save all your chord sheets as a backup, or import to another device.
[Export]   [Import]
```

Mobile note (per your correction on the transpose layout): on mobile, the transpose arrow cluster is **centred**, with the chord progression list **centred below it**, both displayed at a larger size than desktop — legibility for a young pianist at arm's length takes priority over density here. On desktop, the arrow cluster and chord progression can sit on a single row.

### 5.2 The canvas is one component, two states — not two panes

There is a single canvas element. It has exactly two states, toggled by the Preview/Edit control:

- **Edit state:** a plain, syntax-aware text editor showing `rawText` as bracket notation, directly editable. This is where typing, cutting, pasting, and toolbar actions (Add Chord, flat, sharp) happen.
- **Preview state:** a **read-only** rendered view — chords shown above lyrics, as they'll appear in Chord Reader. No inline editing happens here; it exists purely so the user can check their work before saving.

This deliberately supersedes any earlier idea of an "editable preview" (chords rendered as tappable badges you can edit in place). That hybrid pattern is a much harder, more bug-prone thing to build well (contentEditable with embedded interactive widgets has real cursor/IME problems) for very little user benefit over "type in brackets, then look at the rendered result." Two clean states of one component is simpler to build and easier to reason about.

**Toggle behaviour:**

- Inactive (greyed out) until "Chord It" has been tapped at least once.
- After a successful parse, defaults to Preview.
- Tapping Edit returns to the bracket-notation text, editable again.
- Tapping "Chord It" always re-parses current Edit-state text and switches to Preview.

### 5.3 Bracket-notation editing mechanics

- A chord token is written as `[ChordName]` immediately before the word (or at the position) it should sound over — e.g. `[Am]Twinkle [C]twinkle [G]little star`.
- A chord on its own (instrumental break, intro) sits alone on its own bracket, e.g. `[Am] [C] [F] [G]`.
- **Add Chord** (toolbar): inserts `[]` at the current cursor position and places the cursor inside the brackets, ready for keyboard input. Chord letters are auto-uppercased as typed.
- **Flat (b) / Sharp (#)** (toolbar): inserts the respective symbol at the cursor position — useful shortcuts on a touchscreen where `#` may sit behind a symbols-layer tap.
- **Cut / Copy**: standard text operations, scoped to a selected chord token (including its brackets) — this is how a chord is "moved": cut it, place the cursor at the new position, paste.
- Because everything is plain text, no special drag-and-drop, hit-testing, or word-boundary snapping logic is required — this is the main reason bracket notation was chosen over an overlay-editing UI.

### 5.4 Re-parsing trigger: "Chord It" only

The parser does **not** re-run on every keystroke. It runs:

1. Once, when the user taps **Chord It** on initial paste.
2. Once, each subsequent time **Chord It** is tapped after further edits — this regenerates `parsedLines` and `chordList` and switches the canvas to Preview.

`rawText` itself is saved as-is whenever the drawer closes with unsaved changes confirmed (see §5.6) — but `parsedLines`/`chordList`/key-detection only update on "Chord It."

### 5.5 Key-preservation rule on edit

On tapping **Chord It** in Edit mode (i.e. re-parsing an existing song), before writing to IndexedDB:

1. Re-run the parser and key detection silently against the new `rawText`.
2. Compare the newly detected chord structure against the previously stored `originalKey`/chord set.
3. **If the change is minor** (typo fix, single wrong chord, title/artist only, no material change to the chord sequence) → **preserve `currentKey` as-is.** Do not touch `originalKey`.
4. **If the change is major** (chord sequence substantially altered) → re-detect `originalKey` and **reset `currentKey` to match the new `originalKey`.**

**Developer note — needs a concrete threshold.** Use heuristic: if old and new `chordList` differ by ≤1 token AND are the same sequence → minor edit. Otherwise → major. This accounts for corrections without being too strict.

### 5.6 Closing the drawer / unsaved changes

- The drawer tracks a single "dirty" flag covering **any** uncommitted change since the last "Chord It" tap — this includes text edits in the canvas **and** an in-progress transpose (§5.9) that hasn't been committed yet. Both are "Chord It or lose it" in exactly the same way; there is no separate confirmation path for transpose.
- If the drawer is dirty and the user taps Back (or otherwise attempts to close): show a modal — _"Tap Chord It to save your changes, or Cancel to exit without saving."_ with **Got It** (dismiss, stay in drawer) as the only action, per your original wording.
- If there are no unsaved changes (or the user has already tapped Chord It since the last edit or transpose), the drawer closes immediately.
- On close after a successful save: Add mode returns to Chord Library with the new song visible in Recent + All Songs; Edit mode returns to wherever the user came from (Chord Library or Chord Reader).

### 5.7 Undo/redo (temporary measure)

- Two icon buttons (curved arrows) positioned at the bottom right of the canvas, active only in Edit state.
- Operate on a simple in-memory text-edit stack (`editHistory`) scoped to the current Chord Actions session.
- Discarded when the drawer closes, whether by save or cancel. Not persisted.
- **Explicitly a placeholder for v1** — build as a plain array-based stack, don't over-invest.

### 5.8 Friendly parser failure

> I'm having trouble recognising that chord pattern.
> Try pasting the complete chord sheet again.
> Tip: Include both the chords and lyrics.

### 5.9 Transpose

- `[▼] [current key] [semitone offset] [▲]` control, modelled on the reference layout (key and offset shown together, e.g. `E -2`, meaning current key is E, two semitones below the original).
- Chord progression for the current key shown alongside (desktop) or centred below (mobile) the transpose control, in individual boxes.
- Tapping ▲/▼ updates the key and chord progression list live, in-drawer — this is a live preview of the transposition, but per §5.4 it does **not** get written to `currentKey` in storage, and mini-keyboards do **not** update, until **Chord It** is tapped. This keeps the "Chord It commits, otherwise it's just preview" rule consistent across the whole drawer, including transpose.
- "Original Key: X" shown below the transpose row, with a text **Revert** button that resets the transpose control back to the original key (still requires Chord It to commit).

### 5.10 Delete

- Centred, red **Delete Chord** button below the mini-keyboard row.
- Tapping it triggers a delete confirmation. Delete confirmation uses a modal with "Are you sure?" pattern for v1.

### 5.11 Import & Export

- Section title **"Import & Export Chord Library"**, helper text: _"Save all your chord sheets as a backup, or import to another device."_
- `[Export]` `[Import]` buttons, wired to the storage layer in §7.2.

---

## 6. Mini-Keyboard Chord Diagrams

Adopted per the reference approach — this is a self-contained, low-risk feature with no data model impact.

### 6.1 Approach

- Use **`tonal`** (`@tonaljs/chord`) for chord-name → note-name resolution. Do not hand-roll interval/enharmonic logic — `tonal` already handles inversions, extended chords, and sharp/flat spelling correctly and is small and well-tested.
- Convert resolved notes to pitch-class indices (0–11, C=0) for rendering — **this is a pitch-class diagram, not a literal fingering/inversion diagram.** It shows _which notes_, not _which octave or inversion_ to play. This is the right simplification for a beginner and should be stated explicitly in-app or in any help text, so a root-position C and a second-inversion C aren't a source of confusion later.
- Slash chords (`C/E`): include the bass note as an additional highlighted key alongside the notes from the chord quality.

### 6.2 Component architecture

```
src/lib/
  components/
    PianoDiagram.svelte      // renders one keyboard + dots for a given chord name
    KeyboardGrid.svelte      // lays out PianoDiagram instances for a song's chordList
  utils/
    chordToKeys.ts           // chord name → array of active pitch-class indices (via tonal)
```

- `PianoDiagram.svelte` takes a chord name as a prop, resolves active keys via `chordToKeys.ts`, and renders an SVG keyboard (roughly two-octave span, per the reference image) with dots on the relevant keys and the chord name as a label above.
- No stored image assets — everything is generated SVG.

### 6.3 Where it appears

- **Chord Reader only** (not in Chord Actions as a persistent panel — Chord Actions may show a lighter live preview while transposing if useful, but the primary display location is Chord Reader).
- In Chord Reader, keyboards sit **directly below the toolbar, above the chord sheet** — see §7.2 layout.
- Layout: **2×2 grid on mobile**, with tap/swipe paging if the song has more than 4 unique chords. Single row across the viewport on desktop/iPad if space allows, otherwise a wrapped grid.
- **Updates when the user transposes and taps Chord It in Chord Actions** — the keyboards are computed from `chordList` at the _current_ `currentKey`, so once a transpose is committed and the drawer is closed, Chord Reader's keyboards reflect the new key automatically. There is no live keyboard update while merely previewing a transpose in Chord Actions (consistent with §5.9 — nothing commits until Chord It).

---

## 7. Chord Library & Chord Reader

### 7.1 Chord Library (home page)

- **Header**: logo only. No settings icon (all logo assets provided externally; settings/add is handled by the button row below).
- **Button row**: `[Add Chords]` `[Search]` `[Favourites]`
  - On mobile, Search is an icon button that reveals an input field below it when tapped.
  - On desktop, Search can be an expanded input directly.
  - Search is case-insensitive, fuzzy, matched against title and artist.
  - Favourites is a heart icon/button that filters the main song list to favourited songs only.
- **Recent Songs**: deferred — see §9. Ambiguity over "created" vs. "last opened" ordering needs a data-model decision (`lastOpenedAt` field) before implementing.
- **All Songs**: alphabetical with letter-group headers. Each song is a rounded card showing: Title, Artist, Current Key, **View icon**, **Favourite icon**, **Edit icon**.
  - Tapping **View** → opens Chord Reader.
  - Tapping **Edit** → opens Chord Actions (Edit mode, pre-filled).
  - Tapping the **Favourite/heart** icon toggles outline ↔ solid immediately; the song then appears when the Favourites filter is active.

### 7.2 Chord Reader

Strictly read-only (§2). Full-screen drawer, laid out top to bottom:

```
< Back                                          (top left)
Song Title
Artist (if present)
Current Key: x  |  Original Key: x
Chords: x  x  x  x  x

Toolbar: Keyboard show/hide · smaller text · larger text · Chord colour · Edit
── Mini-keyboards (shown by default; see §6.3) ──
── Chord sheet (lyrics with chords displayed over them) ──
```

- **Keyboard toggle** in the toolbar is **active by default** — mini-keyboards are visible on first open.
- **Text size** buttons (smaller/larger) adjust the song's `fontSize`, writing back to the `Song` record and updating the rolling `AppSettings.defaultFontSize` per §2.
- **Chord colour** button opens a dropdown of **six presets**: Deep Blue, Deep Green, Burgundy, Purple, Dark Orange, Dark Grey. Selecting one writes to the song's `chordColour` and updates `AppSettings.defaultChordColour`.
- **Edit** button → opens Chord Actions (Edit mode) for this song.
- **No transpose control here** — deliberately removed to keep Chord Reader minimal. Transposing happens only via Edit → Chord Actions; once committed there with Chord It, the new `currentKey` is reflected here automatically on return.
- **Chord sheet is displayed without a constrained/scrollable inner viewport** — it uses the full available page space (especially important on mobile) rather than being boxed into a fixed-height scrolling panel. The page itself scrolls; there is no nested scroll region for the lyrics.

---

## 7.5 Icon Inventory

- **Existing icons in info/chordflam-icons/**: `edit-fill`, `heart`, `heart-fill`, `piano-on`, `piano-off`, `redo`, `search`, `undo`
- **Required icons to create**: `text-increase`, `text-decrease`, `cut`, `open/view`
- **Note** that flat (b) and sharp (#) symbols will be created as simple text/SVG elements within the chord editing component, not separate external icon assets.

---

## 8. Phased Build Plan

### Phase 0 — Setup

- Confirm Node/npm, SvelteKit CLI, Cloudflare Pages CLI (`wrangler`) versions.
- Scaffold SvelteKit (TypeScript).
- Set up GitHub repo, connect to Cloudflare Pages, confirm placeholder deploy resolves at chordflam.flamtools.com.
- **Deployment strategy**: develop locally with regular GitHub commits; deploy to Cloudflare Pages when ready.
- **Assets**: Clarify that all logos and assets in `info/` will be moved to `src/assets/` during setup.
- Configure Dexie.
- Create module separation: `parser.ts`, `transpose.ts`, `keyDetection.ts`, `chordToKeys.ts`.
- Add `tonal` as a dependency.
- Document and confirm the data model in §3 against this plan before writing feature code.
- **Breakpoint 0:** Review scaffold, deployment pipeline, and data model together.

### Phase 1 — Parser, Key Detection, Transposition & Chord-to-Keys Engine (no UI)

- Parser: bracket-notation "chords-over-lyrics" text (`rawText`) → structured line-by-line model (`ParsedLine[]`), plus tolerant handling of raw UG/Chordu/E-Chords-style pastes that don't yet have brackets (auto-bracket on first "Chord It" if the source text uses a chords-on-their-own-line format instead — see note below).
- Chord-symbol recognition (root + quality + extensions) sufficient to build `chordList`.
- Transposition function: shift root ± N semitones, correct sharp/flat spelling per key.
- Key detection heuristic (best-guess from first/last chord; imperfect is acceptable, user-facing as read-only "Original Key," not directly user-editable).
- Structural-change comparator for §5.5 (minor vs. major edit detection).
- `chordToKeys.ts`: chord name → pitch-class array, via `tonal`.
- **Raw-paste-to-bracket-notation**: build robust version with test cases for Ultimate Guitar, Chordu, E-Chords formats. This is non-trivial but essential.
- Test against 3–5 real pasted chord sheets (mix of clean and messy), plus a handful of hand-typed bracket-notation inputs.
- **Breakpoint 1:** Demonstrate parsing (both bracket-notation and raw-paste-to-bracket conversion), transposition, chord-to-keys resolution, and the minor/major edit comparator against real inputs (console or bare test page) before UI work begins.

> **Note on raw pastes:** most sites (Ultimate Guitar etc.) don't export bracket notation — they show chords on a line above the lyric line. The parser needs a conversion step from that format into bracket notation on first "Chord It," so pasting from a source site still works exactly as before; the user only ever _edits_ in bracket notation, they don't need to type it from scratch unless writing a song by hand. This should be built and tested in Phase 1 alongside the rest of the parser.

### Phase 2 — Storage Layer

- Dexie-based CRUD for `Song` and `AppSettings`.
- Export: serialise full library to downloadable `.json`.
- Import: read `.json`, validate structure, add/update by internal id, no duplicate detection.
- **Breakpoint 2:** Export → clear IndexedDB → import → verify full restore, before wiring into UI.

### Phase 3 — Core UI Shell

- Chord Library: header (logo only, no settings icon), button row (`Add Chords` / `Search` / `Favourites`), All Songs (alphabetical with letter-group headers), rounded song cards showing Title / Artist / Current Key / View / Favourite / Edit icons. Recent Songs deferred, see §9.
- Desktop: centred 480px viewport, matching other Flam apps.
- Drawer mechanics: full-screen overlay drawers (Chord Reader, Chord Actions), matching existing Flam transition pattern.
- Wire open triggers: tap View → Chord Reader; tap Edit → Chord Actions (Edit mode); tap `[Add Chords]` → Chord Actions (Add mode, `editingSongId = null`).
- Empty state: watermarked app icon, "Your library is empty," prompt to add first sheet.
- **Breakpoint 3:** Navigate Chord Library ↔ Chord Reader (dummy content) ↔ Chord Actions (empty form) before wiring real data.

### Phase 4 — Chord Actions Drawer (full functionality)

- Build the single shared component per §5, driven by `editingSongId`.
- Form fields: Title (required), Artist (optional).
- Helper text + source links (Ultimate Guitar, Chordu, E-Chords), new tab.
- Canvas with Edit/Preview toggle per §5.2, bracket-notation editing per §5.3.
- Toolbar: Add Chord, flat, sharp, Cut, Copy.
- Undo/redo per §5.7 (temporary implementation).
- "Chord It" button: parses, regenerates `parsedLines`/`chordList`, runs key-preservation logic (§5.5), switches to Preview.
- Transpose control per §5.9 — live in-drawer preview, commits only on Chord It.
- Mini-keyboard row per §6, reflecting the currently previewed/committed chord set.
- Delete Chord button, confirm step per §5.10/§8.
- Archive section: Export / Import wired to Phase 2.
- Unsaved-changes modal per §5.6.
- Friendly failure state per §5.8.
- **Breakpoint 4:** Full round trip — paste a real song → Chord It → check in Preview → adjust in Edit → Chord It again → close → appears on Chord Library. Then: reopen via Edit → change one chord → Chord It → confirm `currentKey` preserved. Then: reopen via Edit → paste a substantially different chord sequence → Chord It → confirm `originalKey`/`currentKey` reset as expected. Then: transpose, Chord It, close, reopen Chord Reader → confirm key and mini-keyboards reflect the new key.

### Phase 5 — Chord Reader (full functionality)

- Render parsed chord sheet using the song's own `fontSize` and `chordColour`, unconstrained/full-page layout per §7.2.
- Header block: Title, Artist, Current Key / Original Key, chord list.
- Toolbar: keyboard show/hide (active by default), smaller text, larger text, chord colour dropdown (six presets per §7.2), Edit.
- Mini-keyboard grid per §6 — 2×2 mobile with paging, single row/wrapped grid on larger screens.
- On colour/size change: write to the current `Song` record AND update `AppSettings.defaultFontSize` / `defaultChordColour`.
- Edit button → opens Chord Actions (Edit mode), pre-filled.
- **Breakpoint 5:** Full playback experience tested on at least two real screen sizes for readability, transpose-reflects-correctly (after being set in Chord Actions), colour/size persistence-and-seeding behaviour, keyboard grid paging on mobile, and the Edit round-trip.

### Phase 6 — Branding & PWA

- Request logotype, icons (view/edit/favourite/heart), maskable icon, Apple touch icon, favicon at start of this phase.
- Apply Flam design tokens; request shared styling reference if not centralised.
- `manifest.webmanifest`: name, short_name, icon set, theme_color, background_color, display: standalone, start_url, orientation.
- Service worker / offline caching, consistent with other Flam apps.
- Verify "Add to Home Screen" on Android and iOS.
- **Breakpoint 6:** Install to home screen, confirm icons/splash, confirm offline load of a previously viewed song.

### Phase 7 — Polish & Edge Cases

- Empty states: no songs, no favourites, no search results.
- Deletion: confirm/undo flow (§8), confirmed working, understood as a placeholder pending the next UX pass.
- Malformed paste: graceful fallback, no crash.
- Long titles/artist names: truncation/wrap in list and drawers.
- Accessibility pass: tap targets, colour contrast for the six chord-colour presets against the light background.
- **Breakpoint 7:** Full walkthrough — add several real songs, favourite some, transpose (via Chord Actions), adjust display in Chord Reader, edit one song (minor change) and confirm key preserved, edit another (major change) and confirm key resets, export, wipe, reimport.

---

## 9. Deferred (explicitly out of scope for v1)

- Bookmarklet/share-target capture from source sites.
- Cross-device sync or cloud backup.
- Difficulty rating, last-played tracking, and the Chord Library "Recent Songs" list (ambiguous whether ordering should be by creation or last-opened; needs a `lastOpenedAt` field decision — revisit in next UX pass).
- Chord sheet simplify/elaborate (algorithmic or AI-assisted).
- Autoscroll.
- "Search and open source site" quick-link button (small/cheap, could be pulled forward late in Phase 4 if time allows).
- Rich per-field undo/redo, or a redesigned delete-confirmation pattern — expected to be addressed in the next UI/UX iteration.
- Literal fingering/inversion-aware mini-keyboards (current scope is pitch-class only — see §6.1).
- Dark/light mode. v1 is light background only, with no theme setting in the data model. Revisit as a future update — at that point `AppSettings` will need a `theme` field reintroduced.

---

## 10. Open Items Flagged for the Next UI/UX Iteration

1. **Delete flow**: exact confirm pattern (inline confirm vs. modal vs. snackbar-undo) for the "Delete Chord" button in Chord Actions still needs a final decision.
2. **Undo/redo scope**: currently a lightweight in-memory text stack, discarded on drawer close. Whether this should be richer (e.g. surviving a drawer close, or field-level rather than whole-text) is open.
3. **Minor-vs-major edit threshold** (§5.5): first-pass heuristic only, needs tuning against real edits.
4. **Chord colour/font size seeding UX**: the mechanic (per-song value that also updates the rolling default) is decided, but how this is _communicated_ to the user in Chord Reader — so it doesn't feel arbitrary when opening a new song — is a UI question for next iteration.
5. **Mini-keyboard live preview in Chord Actions while transposing**: §5.9/§6.3 currently specify that keyboards only update on committed Chord It, not on live transpose preview. Worth revisiting once built — a live-updating preview might be worth the added complexity, especially for a learner checking finger positions before committing.
6. **Raw-paste-to-bracket-notation conversion** (Phase 1 note): needs testing against a wider variety of real source-site formats to confirm the auto-bracketing step is robust before Phase 4 UI work depends on it.
