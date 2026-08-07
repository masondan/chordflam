import { Chord, Note } from 'tonal';

/**
 * Extracts just the tonic (root note) from a chord/key symbol, e.g. "Am7" -> "A", "F#m" -> "F#".
 */
function extractTonic(symbol: string): string {
  const [tonic] = Chord.tokenize(symbol);
  return tonic || symbol;
}

/**
 * Computes the signed semitone distance needed to transpose `fromKey` to `toKey`,
 * normalised to the range -6..+5 (shortest direction). Only the tonic/pitch-class
 * is considered — quality (major/minor) is ignored, since key labels like "Am"
 * and "C" still just need a pitch-class shift.
 */
export function semitoneDistance(fromKey: string, toKey: string): number {
  const fromChroma = Note.chroma(extractTonic(fromKey));
  const toChroma = Note.chroma(extractTonic(toKey));

  if (fromChroma === undefined || toChroma === undefined) {
    return 0;
  }

  let diff = (toChroma - fromChroma) % 12;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  return diff;
}

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
