import { Chord, Note } from 'tonal';

/**
 * Transposes a single chord symbol by a given number of semitones.
 */
export function transposeChord(chordSymbol: string, semitones: number): string {
  const [tonic, quality, bass] = Chord.tokenize(chordSymbol);
  
  if (!tonic) {
    return chordSymbol; // Not a valid chord, return as-is
  }

  const interval = semitonesToInterval(semitones);
  let transposedTonic = Note.transpose(tonic, interval);
  transposedTonic = Note.simplify(transposedTonic);

  let result = transposedTonic + quality;
  
  if (bass) {
    let transposedBass = Note.transpose(bass, interval);
    transposedBass = Note.simplify(transposedBass);
    result += '/' + transposedBass;
  }
  
  return result;
}

/**
 * Helper to convert a semitone offset (-11 to +11) into a tonal interval string.
 */
function semitonesToInterval(semitones: number): string {
  // Normalize semitones to a positive value between 0 and 11 for the octave
  const normalized = (semitones % 12 + 12) % 12;
  
  const intervals = [
    '1P', // 0
    '2m', // 1
    '2M', // 2
    '3m', // 3
    '3M', // 4
    '4P', // 5
    '4A', // 6
    '5P', // 7
    '6m', // 8
    '6M', // 9
    '7m', // 10
    '7M'  // 11
  ];
  
  return intervals[normalized];
}

/**
 * Transposes a full text containing bracketed chords.
 * E.g., `[Am]Twinkle [C]twinkle` by +2 -> `[Bm]Twinkle [D]twinkle`
 */
export function transposeRawText(rawText: string, semitones: number): string {
  if (semitones === 0 || semitones % 12 === 0) return rawText;

  return rawText.replace(/\[(.*?)\]/g, (match, chord) => {
    return `[${transposeChord(chord.trim(), semitones)}]`;
  });
}
