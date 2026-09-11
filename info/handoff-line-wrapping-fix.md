# Handoff: Chord/lyric line wrapping fix

**Context:** This plan was worked out in a separate conversation without direct access to the current codebase — it's based on your own earlier findings in this thread, not a fresh read of the files. Before implementing, **re-check the current code against every claim and assumption below** and flag anything that's stale, wrong, or riskier than described. Don't just proceed — confirm or correct first, especially the parts marked with ⚠️.

## Problem recap

Three related symptoms, one root cause:
1. Edit textarea (`.canvas`) doesn't wrap — `white-space: pre` pushes long lines off-screen, hard to edit.
2. ChordActions preview: `.chord-row` and `.lyric-row` both use `white-space: pre` — long lines overflow invisibly.
3. ChordReader: `.lyric-row` uses `pre-wrap` (wraps) but `.chord-row` uses `pre` (doesn't) — when a lyric line wraps, its chords get orphaned on the line above/below, breaking column alignment.

Root cause: `formatParsedLineForDisplay()` in `parser.ts` aligns chords to lyrics via monospace column position, which only holds if both rows stay on a single visual line. Naive `pre-wrap` on both rows doesn't fix this — it wraps each row independently at the same character offset, which does **not** guarantee the chord at column 50 stays with the lyric at column 50 once wrapping kicks in.

Confirmed manually: pressing Enter to force a real line break works correctly, because each Enter creates a separate `ParsedLine`, and alignment is exact within one `ParsedLine`.

## Decision: Option B — dynamic-width synthetic breaks

Rejected alternatives, for context (don't re-open):
- **Horizontal scroll**: unusable on mobile — a phone propped on a piano while playing can't be scrolled one-handed.
- **Fixed-character-count synthetic breaks**: doesn't work because font size is user-adjustable (ChordReader has a text-size toggle) and browser zoom is out of our control — any hardcoded char-count breakpoint is only valid for one font size and re-breaks incorrectly the moment size changes.
- **CSS Grid with `1ch` columns**: architecturally cleaner (browser handles wrap natively, no JS recompute), but leans on grid+monospace+sub-pixel rendering being exact across browsers/zoom, which is harder to pin down and debug when it drifts. Chose Option B instead because its failure mode is specific and debuggable (a chord visibly wrong on one line) rather than diffuse (columns off by a pixel everywhere).

**Approach:** At render time, for the two *rendered* views only (ChordActions preview, ChordReader) — not the edit textarea — measure actual available width and inject synthetic line breaks at the point where a line would overflow, keeping the chord row and lyric row breaking at the exact same column. This is a display-only transform; `rawText`, the parser, and the data model are untouched.

## Scope split — two separate fixes, don't conflate them

**1. Edit textarea (`.canvas`) — simple, no alignment risk:**
Plain visual wrap is sufficient here since there's no chord row to keep in sync — it's just raw bracket-notation text.
```css
white-space: pre-wrap;
overflow-wrap: break-word;
```

**2. ChordActions preview + ChordReader display — needs the dynamic-width logic below.** ⚠️ Confirm both components currently share (or could share) the same column-alignment/render logic, so this isn't implemented twice with subtly different behavior.

## Dynamic-width break algorithm (for the two rendered views)

For each `ParsedLine` that would overflow the container at current font size:

1. **Measure available width**: container width in px (the drawer/canvas width — ⚠️ confirm the actual measurable element, since drawer width may differ from content width due to padding).
2. **Measure character width**: monospace, so `1ch` at current computed font-size gives per-character width directly. ⚠️ Confirm the chord/lyric rows are in fact rendered with a monospace font at the point of measurement — the column-alignment approach depends on this being true, worth double-checking there's no per-character kerning or non-monospace fallback in play.
3. **Find candidate break point**: `Math.floor(availableWidthPx / chWidthPx)` gives a raw character offset.
4. **Adjust for word boundaries**: snap the break point back to the nearest preceding space so words aren't split mid-word.
5. **Adjust for chord token straddling** — the trickiest part, treat as its own sub-problem: if a chord token (in the chord row, at the corresponding column) would be split across the break, snap the break point earlier so the full chord token stays on the same side. Needs both constraints (word boundary AND chord-token boundary) satisfied by the same cut point — check what happens when they conflict (e.g. nearest space is mid-chord-span) and pick a sane fallback (likely: prefer the chord-boundary constraint, let that line be very slightly under-full).
6. **Apply the same break offset to both rows** so lyric and chord stay column-aligned after the break — this is the whole point, don't let the two rows compute independent break points.
7. **Recompute on**: font-size toggle, drawer resize/open, orientation change, browser zoom if detectable. ⚠️ Check what resize/observer mechanisms are already available in the codebase (e.g. `ResizeObserver`, existing Svelte reactive bindings) rather than introducing a new pattern — stale breaks after a missed recompute trigger are the main way this fix could silently regress.

## Testing checklist

- Short lines (no wrap needed) — unaffected, no regression.
- Long line with a chord positioned right at the natural break point — verify chord token isn't split, and verify it doesn't shift to a visually confusing position.
- Long line with no spaces near the natural break point (rare edge case) — verify sane fallback rather than a broken layout.
- Font-size increase/decrease while a wrapped line is visible — breaks recompute correctly, no stale wrap.
- Drawer resize / rotation on mobile — breaks recompute correctly.
- Real pasted chord sheets (Ultimate Guitar / Chordu / E-Chords format per AGENTS.md testing note), not just hand-typed bracket notation — these are the actual long-line use case.
- Confirm edit textarea fix (part 1) doesn't need any of the above — it's genuinely independent.

## Before you start

Per AGENTS.md: this touches rendering behavior, not the data model or `rawText` format, so it shouldn't conflict with anything in plan §2's confirmed decisions — but flag it if you see otherwise. Also flag if the actual current code structure makes any step above meaningfully harder or easier than described (e.g. if column alignment isn't purely CSS/monospace-based and there's more parser involvement than assumed).

Report back per the usual response style — concise, what changed/which files, anything needing attention. If the chord-token-straddle logic turns out messier than expected once you're in the code, stop and flag rather than shipping a partial fix.
