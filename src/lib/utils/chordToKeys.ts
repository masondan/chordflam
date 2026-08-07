import { Chord, Note } from 'tonal';

/**
 * Converts a chord symbol into an array of pitch-class indices (0-11, where 0 is C).
 * This is used for rendering the mini-keyboard diagram.
 * It ignores octave/inversion, returning just the active pitch classes.
 */
export function chordToPitchClasses(chordSymbol: string): number[] {
  const chord = Chord.get(chordSymbol);
  
  if (chord.empty) {
    return [];
  }

  const pitchClasses = new Set<number>();
  
  // Add all notes in the chord
  for (const noteName of chord.notes) {
    const pc = Note.chroma(noteName);
    if (pc !== undefined) {
      pitchClasses.add(pc);
    }
  }
  
  // If it's a slash chord (e.g. C/E), tonal's `chord.notes` usually includes the bass note.
  // But just to be sure, we can explicitly add the bass if it's there.
  if (chord.bass) {
    const pc = Note.chroma(chord.bass);
    if (pc !== undefined) {
      pitchClasses.add(pc);
    }
  }
  
  return Array.from(pitchClasses).sort((a, b) => a - b);
}
