# Handoff: Inversion marker chevrons (ChordFlam)

## Before writing any code

Run these checks against the real codebase and report back before implementing anything. Do not proceed to implementation until these are confirmed — several parts of this plan are written from the outside and may be wrong about current internals.

1. **HTML/JSX escaping check for `<`.** Confirm how `parsedLines`/chord tokens currently reach the DOM in the chord-sheet renderer and any mini-keyboard label headers. If chord names are inserted via Svelte's default text interpolation (`{chordName}`), `<` is safe and auto-escaped. If any code path uses `{@html ...}`, raw `innerHTML`, or manual string concatenation into markup, flag this explicitly — it's the one real risk in this whole feature and must be resolved before the character choice is finalised. If it's a problem, report back with alternatives (we discussed `*`/`**` as a fallback) rather than silently switching.
2. **Read the current chord-symbol recognition regex/logic in `parser.ts`.** Confirm exactly what a bracket's contents are expected to match today (e.g. `[A-G][#b]?(chord quality/extension)?(/[A-G][#b]?)?` roughly) and confirm a trailing `<` or `<<` can be appended/stripped without ambiguity against existing grammar (slash chords, `b`/`#`, extensions like `sus4`, `maj7`, `dim`, `add9`, etc). Confirm nothing in current chord quality naming could ever legitimately contain a `<` (should be none, but verify).
3. **Confirm where `chordList` and key-detection consume the bracket contents**, and confirm the chevron suffix is stripped before that logic runs (chevrons must be invisible to `tonal`, transposition, and the minor/major edit comparator in §5.5 of the plan doc — they are a display-only annotation, not a musical fact).
4. **Report back**, in brief, on all three before writing code. If anything above contradicts this plan, stop and flag it rather than improvising a fix.

## Feature summary

Add two new toolbar buttons that insert inversion-marker characters (`<` for "middle" inversion, `<<` for "backward" inversion) at the cursor position, exactly like the existing flat (`b`) and sharp (`#`) buttons — a dumb insert-at-cursor, no bracket-awareness in the button itself. All bracket-awareness lives in the parser.

**Musical/UX context (for reference, not required reading to implement):** these mark which finger/inversion a triad-based chord should be played with for a young/small-handed learner (root position = thumb on root, "middle" = middle finger on root, "backward" = little finger on root, left hand always plays the bare root separately). This is a **label only** — it does not change, recompute, or affect the mini-keyboard diagrams, `chordToKeys.ts`, transposition, or key detection in any way. No new SVG geometry, no new dots. Purely a text suffix stripped before any music-theory logic runs and re-attached only for display.

## Syntax

- Marker sits **inside** the existing chord bracket, immediately after the chord symbol, before the closing bracket: `[F<]`, `[G7<<]`, `[Am<]`.
- No suffix = root position (unchanged from today, zero visual difference).
- `<` = "middle" inversion. `<<` = "backward" inversion. Exactly two states — anything else (3+ chevrons, or a chevron with no preceding valid chord symbol in the bracket) should be treated as a typo/malformed input, not a new state. Confirm with a sensible fallback (e.g. treat 2+ as "backward," don't crash) but do not build a third visual state.
- A chevron character appearing **outside** any `[...]` bracket (stray text) is left as literal text, exactly like a stray `#` or `b` would be today — no parser warning, no special handling, no friendly-failure message. Silently inert, consistent with existing behaviour.

## Scope of changes

1. **Toolbar (UI only):**
   - Add two new buttons after the existing sharp (`#`) button and before Copy: `[<]` and `[<<]`.
   - Final toolbar order, left-aligned group: `[ ]` · flat · sharp · chevron(middle) · chevron(backward). Right-aligned group, unchanged: Copy · Undo · Redo.
   - Buttons must be **square**, not the current slightly-rectangular shape — this applies to ALL toolbar buttons in this row (existing ones included), not just the two new ones. Check current button component/CSS for whatever is producing the rectangular shape and fix uniformly.
   - Insert behaviour: identical mechanism to the flat/sharp buttons — insert the literal character(s) at the current cursor position in the textarea/editor. No cursor-position validation, no "am I inside a bracket" check at the button level. If the existing flat/sharp implementation has any such check, mirror it exactly for consistency; if it doesn't, don't add one for chevrons either.
   - Icons: use a left-pointing chevron/arrow glyph for both buttons; the second button shows two chevrons to visually distinguish single vs. double, consistent with how flat/sharp are visually distinct from each other. Match icon style/weight to the existing toolbar icon set (see `src/lib/components/icons/` and plan §7.5 icon inventory before creating anything new — check whether a suitable chevron icon already exists in that inventory before commissioning a new one).

2. **Parser (`parser.ts` and wherever chord-token regex/extraction lives):**
   - Recognise an optional trailing `<` or `<<` inside a chord bracket's contents.
   - Strip it before passing the chord symbol to `tonal`/`chordToKeys.ts`/key detection/transposition — none of that logic should ever see or be affected by the marker.
   - Retain the marker as a small piece of display metadata attached to that specific chord token/`ParsedSegment` (exact field name/shape is Claude Code's call, but it must survive from parse through to render, and must NOT be stored as a separate persisted field requiring a `Song` data-model change — confirm this can be a property of the already-existing `parsedLines`/`ParsedSegment` structure, regenerated on every "Chord It" like the rest of `parsedLines`, not persisted independently. If this turns out to require a model change, stop and flag rather than silently adding a field — see AGENTS.md's caution on this.).
   - Confirm interaction with the minor/major edit-diff comparator (§5.5): adding/removing/changing a chevron on an otherwise-unchanged chord should almost certainly count as a **minor edit** (preserve `currentKey`), not a major one, since it changes no chord identity or sequence. Flag if the current diff logic would misclassify this, but don't fix it silently — confirm the intended behaviour first.

3. **Rendering (chord sheet display, both Chord Reader and Chord Actions preview state):**
   - Render the marker as a plain text suffix glued onto the chord name wherever the chord name is displayed — e.g. chord displays as `F<` or `G7<<` in the rendered chord-over-lyric view.
   - Do NOT alter the mini-keyboard diagram, its dots, or its label based on the marker. The keyboard for `[G7<<]` renders identically to `[G7]` today. This is a pure text/label feature at this stage — no keyboard geometry work.
   - Confirm this suffix rendering respects the existing per-song `chordColour` styling (i.e. the whole `G7<<` string, marker included, takes the chord's colour — don't leave the marker in a different/default colour by accident).

## Explicitly out of scope (do not build)

- No changes to `chordToKeys.ts`, `PianoDiagram.svelte`, or `KeyboardGrid.svelte`.
- No new Song/AppSettings data model fields.
- No parser warning/friendly-failure UI for stray chevrons outside brackets.
- No support for inversion states beyond root/middle/backward (no third marker, no configurable finger mapping).
- No automatic/computed inversion suggestions — this is purely a manual, user-typed annotation.

## Acceptance check before calling this done

- Paste a real chord sheet (e.g. use the Blueberry Hill example: `C`, `F`, `G7` chords), manually add `<` to the F and `<<` to the G7 via the new toolbar buttons, tap Chord It, and confirm: chord sheet shows `F<` and `G7<<` correctly styled; mini-keyboards for those chords are visually unchanged from plain `F`/`G7`; `currentKey` is preserved (this counts as a minor edit); export/import round-trips the markers correctly since they live in `rawText`.
- Confirm a stray `<` typed outside any bracket just appears as literal text in the sheet, unchanged from how a stray `#` behaves today.
