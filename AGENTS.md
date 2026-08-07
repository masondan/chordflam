## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm
- **Add-ons**: prettier, eslint, sveltekit-adapter

---

# AGENTS.md — ChordFlam

Personal, non-commercial PWA. Piano chord-sheet archive for a family member learning piano. Not part of the Flam journalism-training suite, but reuses Flam build patterns and styling for consistency.

**Source of truth:** `info/chordflam_planv2_updated.md`. This file summarises it for quick reference — if the two ever conflict, the plan doc wins. Don't re-litigate anything in its §2 "Confirmed Product Decisions" without the user explicitly reopening it.

## Stack

SvelteKit (TypeScript) · Cloudflare Pages · Dexie.js (IndexedDB) · `tonal` for chord/note logic · mobile-first, 480px max width, centred on desktop.

No backend, no accounts, no server storage, no external chord APIs, no scraping. Single-user, offline-first.

## Non-negotiables

- **One page, two drawers.** `chordLibrary` (home) → `chordReader` (read-only) / `chordActions` (all editing, add, delete, import/export). No separate edit/import drawers — one shared `ChordActions.svelte` driven by `editingSongId: string | null`.
- **`rawText` is bracket notation, full stop.** `[Am]Twinkle [C]twinkle`. No second editable format. `parsedLines`/`chordList` regenerate only on "Chord It," never per keystroke.
- **Chord Reader is strictly read-only.** No edit, no transpose control there — only display toggles (size, colour, keyboard show/hide) and Edit/Back navigation.
- **Nothing commits except on "Chord It."** Text edits, transpose preview — both are live in-drawer only until Chord It is tapped. Treat as one dirty-flag, one commit path.
- **Key preservation on edit:** ≤1 chord-token difference + same sequence = minor edit, `currentKey` persists. Bigger change = re-detect, reset `currentKey`.
- **Mini-keyboards are computed, never stored.** Pitch-class only (not fingering/inversion), via `tonal`, rendered as SVG. Chord Reader only, not a persistent panel in Chord Actions.
- **Delete = modal "Are you sure?" confirm** for v1 (known placeholder, see plan §10).
- Light mode only. No theme toggle, no theme field in the data model.

## Data model

See plan §3 for the full `Song` / `AppSettings` interfaces. Don't add fields without checking there first — several "obvious" additions (stored keyboard diagrams, persisted undo stack, duplicate detection) were deliberately excluded.

## Design tokens

Full palette/type/spacing/shadow scale in plan §0 (PromptFlam-derived). Six chord colour presets are fixed — don't invent new ones.

## File structure (chord logic)

```
src/lib/
  components/  PianoDiagram.svelte, KeyboardGrid.svelte
  utils/       parser.ts, transpose.ts, keyDetection.ts, chordToKeys.ts
```

## Icons

Live in `info/chordflam-icons/`, get moved to `src/assets/` during Phase 0 setup. Full inventory in plan §7.5 — check before requesting/creating a new one.

## Working process

- **Follow the phased plan (§8) in order.** Each phase ends in a breakpoint — stop there, summarise briefly, wait for confirmation before continuing to the next phase. Don't skip ahead.
- **Test against real pasted chord sheets**, not just hand-typed bracket notation — Ultimate Guitar / Chordu / E-Chords formats are the actual use case (plan §Phase 1 note).
- Open items in plan §10 are _known open_ — don't silently pick an answer, flag it and ask if it becomes blocking.

## Response style

- After completing a task: **1–3 lines**. What changed, which files, anything needing attention. No restating the plan back to the user, no re-explaining decisions already made.
- Don't re-summarise the whole plan or prior discussion at the start of a new task — assume this file plus the plan doc are sufficient context.
- Flag blockers and open questions plainly; don't bury them in a wall of text.
