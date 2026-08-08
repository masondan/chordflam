import { Chord, Note } from 'tonal';

/**
 * Semitone offsets (from the root) for a basic triad, keyed by tonal's
 * `Chord.get().quality` value. Per §6.1 the mini-keyboard is a deliberate
 * simplification for a young learner: it shows the root + 3rd + 5th in
 * root position, plus (per the 2026-08 UI/UX pass) a single extra dot for
 * the 7th when the chord symbol contains one — see `seventhOffset()` below.
 * It never shows 9ths/11ths/13ths/6ths/etc individually; those extended
 * chords collapse down to "triad + 7th" the same as a plain 7th chord,
 * since `tonal` already folds them into a sensible `quality` (Major/Minor/
 * Diminished/Augmented) and an `intervals` list that still includes the 7th.
 *
 * Chords with no inherent 3rd (sus2, sus4, power/5 chords) fall back to a
 * plain major triad — there is no "correct" triad to strip them to, and a
 * major triad is the least confusing simplification for a learner.
 */
function triadOffsetsForQuality(quality: string): number[] {
  switch (quality) {
    case 'Minor':
      return [0, 3, 7];
    case 'Diminished':
      return [0, 3, 6];
    case 'Augmented':
      return [0, 4, 8];
    case 'Major':
    default:
      return [0, 4, 7];
  }
}

/**
 * Semitone offset (from the root) for the 7th, if the chord's interval list
 * contains one. Covers major 7ths (CMaj7), minor 7ths (C7, Cm7, Cm7b5), and
 * diminished 7ths (Cdim7) — as well as any further extension (9/11/13/add9
 * etc.) that still carries one of these intervals under the hood in tonal's
 * `intervals` array. Returns null when there's no 7th to show (plain triads,
 * sus chords, add9 without a 7th, etc.).
 */
function seventhOffset(intervals: string[]): number | null {
  if (intervals.includes('7M')) return 11; // major 7th (Maj7)
  if (intervals.includes('7m')) return 10; // minor 7th (dominant 7, m7, m7b5)
  if (intervals.includes('7d')) return 9; // diminished 7th (dim7)
  return null;
}

/** The role a dot plays in the diagram, used to pick its colour/style. */
export type PitchClassRole = 'triad' | 'seventh' | 'bass';

export interface PitchClassEntry {
  pc: number;
  role: PitchClassRole;
}

/**
 * Converts a chord symbol into an ordered array of pitch-class entries
 * (0-11, where 0 is C), each tagged with the role it plays in the chord.
 * This is used for rendering the mini-keyboard diagram.
 *
 * Resolves to the basic triad (root, 3rd, 5th) in root position, plus a
 * 7th dot when the chord symbol contains one (Maj7, 7, m7, m7b5, dim7, and
 * further extensions that still carry a 7th) per §6.1. An explicit
 * slash-chord bass note (e.g. C/E) is added as an extra "bass" dot.
 */
export function chordToPitchClasses(chordSymbol: string): PitchClassEntry[] {
  const chord = Chord.get(chordSymbol);

  if (chord.empty || !chord.tonic) {
    return [];
  }

  const rootPc = Note.chroma(chord.tonic);
  if (rootPc === undefined) {
    return [];
  }

  // Return notes in order: [root, 3rd, 5th, ?7th, ...bass].
  // This ensures the diagram always reads left-to-right as
  // root→3rd→5th→7th when the keyboard's dots are placed in sequence from
  // the root's position.
  const result: PitchClassEntry[] = [];
  const offsets = triadOffsetsForQuality(chord.quality);

  for (const offset of offsets) {
    result.push({ pc: (rootPc + offset) % 12, role: 'triad' });
  }

  const seventh = seventhOffset(chord.intervals);
  if (seventh !== null) {
    result.push({ pc: (rootPc + seventh) % 12, role: 'seventh' });
  }

  // Explicit slash-chord bass note (§6.1 exception) — added as an extra dot
  // even though it's not part of the root-position triad above.
  if (chord.bass) {
    const bassPc = Note.chroma(chord.bass);
    if (bassPc !== undefined && !result.some((entry) => entry.pc === bassPc)) {
      result.push({ pc: bassPc, role: 'bass' });
    }
  }

  return result;
}
