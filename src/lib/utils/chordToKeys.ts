import { Chord, Note } from 'tonal';

/**
 * Semitone offsets (from the root) for a basic triad, keyed by tonal's
 * `Chord.get().quality` value. Per §6.1 the mini-keyboard is a deliberate
 * simplification for a young learner: it always shows root + 3rd + 5th in
 * root position, never 7ths/9ths/6ths/etc, regardless of how extended the
 * actual chord symbol is (A7, CMaj7, Cm7b5, C13, ...). `tonal` already folds
 * those extensions into a sensible `quality` (Major/Minor/Diminished/
 * Augmented) even for altered/extended chords, so we key off that rather
 * than re-deriving intervals ourselves.
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
 * Converts a chord symbol into an array of pitch-class indices (0-11, where 0 is C).
 * This is used for rendering the mini-keyboard diagram.
 *
 * Always resolves to the basic triad (root, 3rd, 5th) in root position —
 * never 7ths/9ths/extensions — per §6.1. The one exception is an explicit
 * slash chord (e.g. C/E), whose bass note is added as an extra dot.
 */
export function chordToPitchClasses(chordSymbol: string): number[] {
  const chord = Chord.get(chordSymbol);

  if (chord.empty || !chord.tonic) {
    return [];
  }

  const rootPc = Note.chroma(chord.tonic);
  if (rootPc === undefined) {
    return [];
  }

  const pitchClasses = new Set<number>();
  for (const offset of triadOffsetsForQuality(chord.quality)) {
    pitchClasses.add((rootPc + offset) % 12);
  }

  // Explicit slash-chord bass note (§6.1 exception) — added as an extra dot
  // even though it's not part of the root-position triad above.
  if (chord.bass) {
    const bassPc = Note.chroma(chord.bass);
    if (bassPc !== undefined) {
      pitchClasses.add(bassPc);
    }
  }

  return Array.from(pitchClasses).sort((a, b) => a - b);
}
