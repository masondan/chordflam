# Handoff: Tempo / metronome feature

**Context:** This plan was worked out in a separate conversation without direct access to the current codebase. Before implementing, **re-check the current code against every claim and assumption below** and flag anything stale, wrong, or riskier than described — especially points marked ⚠️. Confirm or correct first, don't just proceed.

## Feature summary

Optional tempo/time-signature metadata per song, displayed as an animated dot-based visual metronome (no audio in this iteration — visual pulse only). Two surfaces:
- **ChordActions**: where tempo/time-signature are set, with a live preview/audition of the metronome.
- **ChordReader**: read-only display of the metronome in a collapsible bottom drawer, with an edit shortcut back to ChordActions.

## Data model

Two new **optional** fields on `Song`:
- `timeSignature: string | null` — one of `"2/4"`, `"3/4"`, `"4/4"`, `"6/8"`, `"12/8"`. Default when a song has none set: treat as absent, don't show the metronome at all in ChordReader (per "IF the user added tempo information" below).
- `bpm: number | null` — range 40–208. Default when first opening the Tempo dropdown for a song with no value yet: 100, time signature defaults to 4/4.

⚠️ Confirm exact `Song` interface location/shape against `db.ts` before adding fields — per AGENTS.md, don't add fields without checking the plan doc first (plan §3), since some "obvious" additions were deliberately excluded. This may be a first-time addition, not a precedent — confirm nothing here conflicts with prior exclusions.

**Commit behavior**: tempo/time-signature are plain metadata fields, not raw text. They do **not** follow the "nothing commits except on Chord It" rule — Chord It only applies to `rawText` → chord/keyboard parsing. Tempo fields save on **Save & Close** (normal drawer save), and **Cancel discards them** like any other uncommitted field edit. ⚠️ Confirm this is consistent with how other non-`rawText` metadata fields (e.g. video link) already behave in the drawer, since this should follow existing precedent rather than introduce a new save pattern.

## Time signatures and dot/marker display — core logic

This is the trickiest part conceptually; read carefully, it's a specific and slightly unusual design, not the obvious "one dot per beat" approach.

**Dot count is fixed per time signature, independent of subdivision count:**
- 2/4 → 2 dots
- 3/4 → 3 dots
- 4/4 → 4 dots
- 6/8 → 3 dots (not 6)
- 12/8 → 3 dots (not 12)

**Simple meters (2/4, 3/4, 4/4)**: dots animate left-to-right, one dot lights per beat, no group marker. Standard metronome behavior.

**Compound meters (6/8, 12/8)**: the *same* 3 dots represent one felt pulse-group ("1-and-uh"), and cycle repeatedly — once per group in the bar. A **group marker** appears after the 3 dots and accumulates across the bar to show which group is currently playing:
- 6/8 = 2 groups per bar. Group 1: dots cycle, marker shows `|`. Group 2: dots cycle again (same 3 dots, restarting), marker shows `||` (the first `|` persists, joined by a second). After group 2 completes, reset to group 1 / single `|` and repeat.
- 12/8 = 4 groups per bar. Markers accumulate `|` → `||` → `|||` → `||||` across the four groups, then reset to `|` on the next bar.
- The **final marker in the sequence** (the one completing the bar — `||` for 6/8, `||||` for 12/8) should read as visually distinct/heavier than the mid-bar marker(s), similar to how a double barline or system-end reads differently from a single barline in notation. Exact styling (bolder weight, wider spacing, etc.) is a visual-design decision, not a logic one — use judgement, but make sure "bar complete" is visually distinguishable from "mid-bar."
- No emphasis differentiation *within* a group (i.e. no special styling for the first of the 3 dots vs. the other two) in this iteration — deferred, flagged as a possible future refinement, don't build it now.

⚠️ **Open item — verify before/during implementation**: 6/8's 3 dots + up to `||` marker, and 12/8's 3 dots + up to `||||` marker, need to fit legibly in the ChordActions toolbar and the ChordReader drawer row at 480px max width (mobile-first per AGENTS.md). Check actual rendered width once built; if 12/8's four-mark accumulation is too cramped or unclear at small sizes, flag it back rather than shipping something illegible — don't silently shrink dots/markers to fit without checking legibility first.

**Animation mechanics**: `setInterval`/`requestAnimationFrame`-driven beat advance is fine for this visual-only version (no audio, so no strict clock-drift concerns) — interval length in ms = `60000 / bpm`. Recompute/restart cleanly if bpm or time signature changes while playing.

## ChordActions — Tempo dropdown

New dropdown below the existing Video dropdown, same collapsible style, title **"Tempo (Optional)"**. Two rows inside:

### Row 1 — toolbar
Fits full canvas width; size the BPM cluster to take up the flexible/remaining space so the row fills edge to edge. Single-icon buttons are square. Left to right:

1. **Play/Pause** — `icon-play.svg`. Same active button style as the existing toolbar above the chordsheet input canvas (dark grey icon, white background, grey rounded-corner border). Tapping starts the dot/marker animation in Row 2 and toggles the icon/button to **active style: white icon out of dark grey background** (standard app active-state convention — not a unique purple state). Tapping again stops the animation and reverts to default style.
2. **Time signature dropdown** — chevron-style dropdown (`icon-chevron-up.svg` / `icon-chevron-down.svg`, same style/size as the Video dropdown's chevrons). Options: `2/4`, `3/4`, `4/4`, `6/8`, `12/8`. Default `4/4`. Auto-closes on selection. No label above/beside it. Changing the value immediately updates Row 2's dot count and group-marker behavior (live preview, doesn't require Play to be active to see the static dot count change).
3. **BPM cluster** — same visual pattern as the existing chord-transpose cluster (see reference screenshot: grey number centered, white-on-grey chevrons left/right). Tapping a chevron moves BPM ±1. Range 40–208, default 100. **Fixed minimum width** sized to the max value (208) so the cluster doesn't visually jump width as the number changes length (e.g. 40 → 100 → 208 should not reflow the layout).
4. **Tap tempo** — `icon-tap.svg`. Default inactive grey style; **active/pressed style: white icon out of dark grey** (same standard active-state convention as Play/Pause — no separate purple treatment needed here either, per resolved discussion).

**Tap tempo logic** (needs real implementation, not just "feels responsive"):
- Record a timestamp on each tap.
- From the 2nd tap onward, compute BPM live from tap intervals and update the BPM cluster's displayed number in real time as tapping continues.
- **Smooth the value**: average the last 3–4 tap intervals rather than recalculating purely from the single most recent interval, so the displayed number doesn't jitter wildly between rapid, slightly-uneven human taps.
- **Reset on long pause**: if the gap since the previous tap exceeds ~2 seconds (i.e., implies < 30 BPM, below the useful range), treat the next tap as the start of a fresh tap sequence rather than folding a huge gap into the average.
- Clamp the resulting value to the 40–208 range.

### Row 2 — tempo display
Centered row of dots (+ group marker for compound meters), directly under the toolbar. Purely visual, no button borders around the dots (this is a display row, not a control row).

- **Dot count**: 2/3/4/3/3 for 2/4, 3/4, 4/4, 6/8, 12/8 respectively (see above).
- **Inactive dot style**: pale grey background, purple outline (matches the reference screenshot's inactive-dot treatment, adapted to purple as the app's active colour — see colour rule below).
- **Active dot**: solid fill in the active colour, animating left to right through the dot row in time with BPM, looping back to the start (with a mild pulse effect on the return-to-start dot) when Play is active. When Play is inactive, show the static default state (first dot solid, rest inactive) as a resting/preview state.
- **Group marker** (6/8, 12/8 only): appears after the dot row, accumulates per the logic above, resets each bar cycle.
- **Colour rule**: default active colour is purple. If the song has a user-assigned chord colour (from the existing ChordReader colour dropdown), use that colour instead — same rule and same colour value as the chord-display colour, so the two stay in tandem. ⚠️ Confirm exactly how/where the current chord colour is stored/read on a `Song` so this reuses the same source of truth rather than duplicating colour logic.

**Preview/audition behavior**: Play/Pause here is a live preview using the in-drawer (not-yet-saved) tempo/time-signature values. ⚠️ Stop/reset this preview animation automatically on both **Save & Close** and **Cancel**, so it doesn't keep running invisibly after the drawer closes — confirm there's a clean unmount/teardown hook available for this in the existing drawer lifecycle.

## ChordReader — metronome drawer

- Only appears **if the song has tempo information set** (`timeSignature` and `bpm` both present). No drawer/tab at all otherwise.
- Bottom drawer, same size/style as the existing Edit drawer in ChordActions, **except**: this is a pop-up drawer with a **tab positioned on the right edge** (not the existing edit-drawer's tab convention — confirm current tab positioning pattern before assuming this is a simple style copy).
- **Tab contents**: `icon-metronome.svg` + up/down chevron, indicating expand/collapse.
- ⚠️ **Mobile safe-area check**: this drawer sits at the bottom of the viewport — confirm padding accounts for `env(safe-area-inset-bottom)` (iOS home-indicator area) so the tab isn't obscured or awkwardly placed on notched/gesture-nav devices.
- ⚠️ Confirm this drawer is implemented as fixed/overlay UI, not a participant in ChordReader's single-scroll-container rule (per AGENTS.md non-negotiables) — it's chrome, not scrollable content.

**Drawer contents — single horizontal row, no button borders around icons/dots** (same bare-icon treatment as the icon row beside each chord card in ChordLibrary):

- **Left-aligned**: Play/Pause button (same behavior/style as ChordActions) + dot/marker row (same rendering rules as ChordActions, including the colour-tandem rule).
- **Right-aligned**: time signature label (e.g. "4/4") + BPM number (display only, not editable here) + Edit icon (`icon-fill.svg`). Tapping Edit navigates to ChordActions with the Tempo dropdown pre-opened.
- ⚠️ Stop the ChordReader metronome animation when this drawer is closed/collapsed (don't let it keep running invisibly in the background) — same principle as the ChordActions preview teardown above, confirm a consistent mechanism is used for both.

## Explicitly out of scope for this iteration

- **Audio/click sound** — visual-only metronome for now. (If added later: requires Web Audio API scheduling, not `setInterval`, for acceptable timing precision — flagged for a future pass, not this one.)
- **Direct numeric BPM entry** (tap the number to type a value) — deferred; only chevron ±1 and tap-tempo are in scope now.
- **Within-group downbeat emphasis** for compound meters (e.g. visually distinguishing the first of the 3 dots) — deferred.
- **5/4 and other asymmetric/uncommon time signatures** — not in the dropdown for this iteration.

## Testing checklist

- Each time signature's dot count and (for 6/8, 12/8) group-marker accumulation/reset renders correctly and legibly at 480px width.
- BPM cluster width stays fixed across the full 40–208 display range (40, 100, 208 — no reflow).
- Tap tempo: smoothing behaves reasonably with real uneven taps; long pause correctly resets rather than corrupting the average; result clamps to 40–208.
- ChordActions preview Play/Pause stops cleanly on both Save & Close and Cancel.
- ChordReader drawer only appears when tempo data exists; absent otherwise.
- ChordReader metronome stops when drawer is collapsed/closed.
- Colour-in-tandem rule: changing a song's chord colour updates the metronome's active colour to match, in both ChordActions and ChordReader.
- Edit icon in ChordReader correctly opens ChordActions with Tempo dropdown already expanded.
- Safe-area padding on the ChordReader tab checked on an actual notched/gesture-nav mobile device or simulator, not just desktop browser resize.

## Before you start

Flag anything above that conflicts with current code structure, existing drawer/tab patterns, or plan §2's confirmed decisions — this plan wasn't checked against the live codebase. If the group-marker accumulation logic or the colour-tandem lookup turns out messier than described once you're in the code, stop and flag rather than shipping a partial or guessed implementation.

Report back per usual response style — concise, what changed/which files, anything needing attention.
