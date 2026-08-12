# Handoff: Video Links feature — ChordFlam

Read `AGENTS.md` and `info/chordflam_planv2_updated.md` first. This feature is additive metadata + a Reader display toggle — it does not touch parsing, transpose, or key detection, and does not change the commit-on-"Chord It" model (video links save independently, see below).

Follow the phased breakdown below in order. Stop at each breakpoint, summarise briefly (1–3 lines per AGENTS.md response style), wait for confirmation before continuing.

---

## Context / rationale

User plays along to YouTube tutorials while reading chord sheets. Currently requires tab-switching. Goal: let a video be opened inline, below the chord sheet, collapsed by default, one at a time — without cluttering Chord Reader or requiring any external network calls (no title-fetch, no oEmbed, no scraping — consistent with existing "no external chord APIs" rule).

---

## Data model

Add to `Song` interface in `db.ts`:

```ts
videoLinks?: { id: string; url: string; title: string }[]
```

- Optional, defaults to `undefined`/`[]`. No migration needed for existing songs.
- `id`: generate on add (e.g. `crypto.randomUUID()` or existing ID pattern used elsewhere in the codebase — check `db.ts` for precedent).
- Order = insertion order, **most recent first** (new entries unshift to front of array, not push).
- Video links save/update/delete **independently of "Chord It"** — they are not part of the dirty-flag/commit flow that governs `rawText` edits. Adding, editing, or deleting a video link writes to the DB immediately, same as toggling a favourite.

No new util file needed for storage — CRUD can live alongside existing song CRUD in `db.ts`.

---

## Part 1: Chord Actions — Video input UI

Location: below Song Title and Artist/Info inputs, same visual style (see attached reference screenshot for input styling — plain bordered input, label above).

### Step 1 — URL input

- Label: **Video**
- Input placeholder/helper text: `Add URL: https://www.youtube.com/...`
- Validation on blur/change: attempt `new URL(value)`. This is **structural validation only** — checks the string is a well-formed URL, not that it's a real/reachable video. No network call.
  - **Success**: show a grey checkmark to the right of the input. Input text itself may be truncated for display but should retain full value internally.
  - **Failure** (non-empty but invalid): show text below input: `URL failed. Please try again.`
  - Empty input: no message, no checkmark, title input stays inactive.
- Title input (Step 2) only becomes active/enabled once URL validation succeeds.

### Step 2 — Title input

- Label: **Video title**
- Plain text input, becomes active only after Step 1 validates.
- To the right: `icon-chevron-right.svg` as a confirm button.
- On tap (title non-empty):
  - New entry: create `{ id, url, title }`, unshift into `videoLinks`, save to DB.
  - Editing existing entry (see Edit flow below): update that entry's `title` in place (URL unchanged), save to DB.
  - Clear both URL and title inputs back to empty/inactive state after save.

### Step 3 — Video link rows (below the two inputs)

For each entry in `videoLinks`, most recent first:

```
[Title, truncated as needed]   [icon-trash.svg]  [icon-edit.svg]  [icon-view.svg]
```

- **Trash**: delete this entry from `videoLinks`, save immediately. No confirm modal needed for this (unlike song delete) — low-stakes, easily re-added. *(Flag to user if this seems wrong — song delete uses a modal per AGENTS.md, this is a lighter-weight sub-item, but confirm the asymmetry is acceptable before shipping.)*
- **Edit**: populate Step 1 URL input with this entry's URL, but **inactive / light grey / read-only** (not editable — URL is fixed once added). Populate Step 2 title input with this entry's title, **active and editable**. Chevron now updates the existing entry (matched by `id`) rather than creating a new one. Row stays visible/unchanged in the list until save.
- **View**: expand a preview iframe inline within Chord Actions (below the row), same embed logic as Part 2, for the user to sanity-check the link before leaving the drawer. Same collapse behaviour — tap again (icon becomes `icon-view-hide.svg` or equivalent toggle) to collapse. Only one preview open at a time within Chord Actions, independent of Reader's open state.

---

## Part 2: YouTube ID extraction util

New file: `src/lib/utils/videoEmbed.ts`

```ts
export function extractYouTubeId(url: string): string | null
```

Must handle at minimum:
- `youtube.com/watch?v=ID`
- `youtu.be/ID`
- `youtube.com/watch?v=ID&list=...&t=90s` (extra params)
- `youtube.com/embed/ID`
- `m.youtube.com/watch?v=ID`
- URLs with `si=` share-tracking params

Returns `null` for anything unrecognised (non-YouTube URLs, malformed video IDs). This is the sole determinant of "can we attempt an embed" — no other validation.

Also export:
```ts
export function getEmbedUrl(videoId: string): string
// returns `https://www.youtube.com/embed/${videoId}`
```

Write a few inline test cases or a quick manual check against real pasted URLs (not just clean hand-typed ones) — same "test against real pasted input" principle AGENTS.md applies to chord sheets.

---

## Part 3: Chord Reader — video link display

Location: below the chord sheet, only rendered if `videoLinks.length > 0`.

- Fine separator line above the section.
- No "Video" / "Videos" header.
- One row per entry, most recent first:

```
[icon-video.svg]  [title, truncated, medium grey]  [icon-view.svg, medium grey]
```

- Entire row styled in medium grey (icon + title + view icon) — deliberately low-contrast so it doesn't compete with the chord sheet.
- **Tap `icon-view.svg`**:
  1. Call `extractYouTubeId(entry.url)`.
  2. **If it returns an ID**: expand an iframe (`getEmbedUrl(id)`) directly below that link row. Icon swaps to `icon-view-hide.svg`. Tapping it again collapses the iframe and reverts the icon.
  3. **If it returns `null`**: instead of an iframe, show inline (in the same space the iframe would occupy): `Video could not be opened. Try in browser/app?` with `[Cancel]` `[Yes]` buttons.
     - **Yes**: open `entry.url` via standard external link handling (`window.open` / anchor with `target="_blank"`, whatever pattern is already used elsewhere in the app for external links — check for precedent). Then collapse back to the row (icon reverts).
     - **Cancel**: collapse back to the row (icon reverts), same as tapping `icon-view-hide.svg`.
- **Only one video/message expanded at a time**, across the whole list. Tapping View on a different row closes whatever is currently open (iframe or failure-message) and opens the newly tapped one.
- **No persistence** — Reader always opens with all videos collapsed, regardless of what was expanded last time this song was viewed.
- **Known limitation, do not attempt to fix in v1**: a structurally valid YouTube URL pointing to a deleted/private/region-blocked video will still attempt an embed and may show a blank/broken iframe rather than triggering the fallback message, since iframe load failures aren't reliably detectable client-side. This is accepted for v1.

---

## Icons

All icons already exist in the project — confirm exact filenames against the registry in `src/lib/components/icons/icons.ts` / `info/chordflam-icons/` before use, in case naming differs slightly from this doc (`icon-trash`, `icon-edit`, `icon-view`, `icon-view-hide`, `icon-chevron-right`, `icon-video`). Add to `IconName` type registry only if any are missing (should not be necessary).

---

## Phases / breakpoints

1. **Data model + Reader-facing util**: `videoLinks` field on `Song`, CRUD helpers in `db.ts`, `videoEmbed.ts` with `extractYouTubeId`/`getEmbedUrl` + test cases. No UI yet. → Stop, confirm util handles real pasted URLs correctly.
2. **Chord Actions UI**: URL/title two-step input, validation states, link rows with trash/edit/view, independent-save behaviour. → Stop, test add/edit/delete/preview manually.
3. **Chord Reader UI**: separator, link rows, expand/collapse iframe, failure fallback message, single-open-at-a-time logic. → Stop, test with a mix of valid YouTube links, non-YouTube links, and malformed video IDs.

Don't skip ahead between phases. Flag anything in this spec that turns out to be ambiguous or conflicts with existing code, rather than guessing.

---

## Explicitly out of scope for v1

- No title auto-fetch (oEmbed or otherwise) — title is always user-typed.
- No non-YouTube embed support — non-YouTube URLs always fall back to the "open externally" path in Reader.
- No re-editing of URL once added (delete + re-add only).
- No confirm-modal on video-link delete (unlike song delete).
- No detection of broken/private/deleted YouTube videos at embed time.
