import { Chord, Key, Note } from 'tonal';

/**
 * Quality strings (as returned by `Chord.get(...).quality`) that correspond
 * to a plain diatonic triad. Anything else (sus, add9, power/5 chords, etc.)
 * is harmonically ambiguous with respect to key and is treated as neutral
 * evidence — it simply doesn't vote for any candidate key below.
 */
const DIATONIC_QUALITIES = new Set(['Major', 'Minor', 'Diminished', 'Augmented']);

/** Canonical (sharp-spelled) note name for each pitch class 0-11. Used only
 * as an internal, spelling-agnostic handle for each of the 12 candidate
 * keys — the *displayed* key name always prefers the spelling the song
 * itself used (see `representativeName` below), falling back to this only
 * when the winning tonic never actually appeared as a chord in the song. */
const CANONICAL_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface ClassifiedChord {
  chroma: number;
  quality: string;
  tonicName: string;
}

/** Reduces a chord symbol to (pitch class, quality, original spelling), or
 * null if it's not a plain triad-derived quality (see DIATONIC_QUALITIES). */
function classifyChord(symbol: string): ClassifiedChord | null {
  const chord = Chord.get(symbol);
  if (chord.empty || !chord.tonic) return null;

  const chroma = Note.chroma(chord.tonic);
  if (chroma === undefined || !DIATONIC_QUALITIES.has(chord.quality)) return null;

  return { chroma, quality: chord.quality, tonicName: chord.tonic };
}

interface DiatonicTriad {
  chroma: number;
  quality: string;
}

/** The 7 diatonic triads (I ii iii IV V vi vii°) of the major key rooted at
 * `rootChroma`, expressed as (pitch class, quality) pairs so matching is
 * spelling-agnostic (e.g. Db vs C#). */
function diatonicTriadsForMajorKey(rootChroma: number): DiatonicTriad[] {
  const key = Key.majorKey(CANONICAL_NAMES[rootChroma]);
  return key.triads.map((triadSymbol) => {
    const triad = Chord.get(triadSymbol);
    return { chroma: Note.chroma(triad.tonic as string) as number, quality: triad.quality };
  });
}

/**
 * Detects the key of a song from its chords using diatonic-set scoring.
 *
 * `chordOccurrences` must be every chord *occurrence* in the song, in order,
 * with repeats — NOT a deduplicated chord list. Frequency is the primary
 * signal, so a chord that's played 20 times must outweigh one played once.
 *
 * Algorithm:
 * 1. Classify each occurrence into (pitch class, quality). Chords with a
 *    quality that isn't a plain triad (sus, add9, power/5, etc.) are
 *    dropped — they don't belong to any key's diatonic triad set, so they'd
 *    only add noise.
 * 2. For each of the 12 possible major keys, score it by summing the
 *    occurrence counts of every song chord that matches one of that key's 7
 *    diatonic triads (I ii iii IV V vi vii°) — not just I/IV/V. This lets
 *    ii/iii/vi-heavy folk/pop progressions (very common in this project's
 *    real-world corpus) score correctly, not just simple I-IV-V songs.
 * 3. The highest-scoring key wins. A major key and its relative minor share
 *    an *identical* diatonic triad set (e.g. C major and A minor both use
 *    C-Dm-Em-F-G-Am-Bdim), so step 2 can't distinguish them — resolve that
 *    ambiguity by comparing how often the song actually leans on the major
 *    tonic (I) chord vs the relative-minor tonic (vi) chord. A true tie is
 *    broken by whichever of those two the song actually opens on.
 *
 * This deliberately does not use "last chord" as a signal at all — outros
 * vary too much (fade on IV, V, or vi) to be a reliable indicator, and it's
 * exactly what caused songs like "All I Have to Do Is Dream" (C major, with
 * a passing D chord late in the bridge) to be misdetected as D.
 */
export function detectKey(chordOccurrences: string[]): string {
  if (!chordOccurrences || chordOccurrences.length === 0) {
    return 'C'; // Fallback
  }

  const classified = chordOccurrences
    .map(classifyChord)
    .filter((c): c is ClassifiedChord => c !== null);

  if (classified.length === 0) {
    return 'C';
  }

  // Weighted evidence: how many times each (pitch class, quality) actually
  // occurs, plus the first-seen spelling so the output preserves the song's
  // own notation (e.g. "Bb" rather than "A#").
  const counts = new Map<string, number>();
  const representativeName = new Map<string, string>();
  for (const c of classified) {
    const key = `${c.chroma}|${c.quality}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!representativeName.has(key)) {
      representativeName.set(key, c.tonicName);
    }
  }

  let bestScore = -1;
  let bestChroma = 0;

  for (let rootChroma = 0; rootChroma < 12; rootChroma++) {
    const triads = diatonicTriadsForMajorKey(rootChroma);
    let score = 0;
    for (const triad of triads) {
      score += counts.get(`${triad.chroma}|${triad.quality}`) || 0;
    }
    if (score > bestScore) {
      bestScore = score;
      bestChroma = rootChroma;
    }
  }

  // Resolve major-vs-relative-minor ambiguity (see step 3 above).
  const majorKey = Key.majorKey(CANONICAL_NAMES[bestChroma]);
  const minorRelativeChroma = Note.chroma(majorKey.minorRelative) as number;

  const majorTonicCount = counts.get(`${bestChroma}|Major`) || 0;
  const minorTonicCount = counts.get(`${minorRelativeChroma}|Minor`) || 0;

  let useMinor: boolean;
  if (majorTonicCount !== minorTonicCount) {
    useMinor = minorTonicCount > majorTonicCount;
  } else {
    // True tie (including the "neither ever appears" case) — fall back to
    // whichever tonic the song actually opens on; default to major if the
    // opening chord is neither, since major keys are the more common case.
    const first = classified[0];
    useMinor = first.chroma === minorRelativeChroma && first.quality === 'Minor';
  }

  if (useMinor) {
    const name = representativeName.get(`${minorRelativeChroma}|Minor`) || majorKey.minorRelative;
    return name + 'm';
  }

  return representativeName.get(`${bestChroma}|Major`) || CANONICAL_NAMES[bestChroma];
}

/**
 * Compares two chord lists to determine if an edit is minor or major.
 * Minor edit: <= 1 chord token difference AND same sequence.
 * Major edit: otherwise.
 */
export function isMajorEdit(oldChordList: string[], newChordList: string[]): boolean {
  // If the lengths differ by more than 1, it's definitely a major edit
  if (Math.abs(oldChordList.length - newChordList.length) > 1) {
    return true;
  }

  // To check if they are the "same sequence" with <= 1 token difference,
  // we can compute the Levenshtein distance or simply check if one can be 
  // formed from the other by 0 or 1 insertion/deletion/substitution.
  
  let differences = 0;
  let i = 0, j = 0;
  
  while (i < oldChordList.length && j < newChordList.length) {
    if (oldChordList[i] !== newChordList[j]) {
      differences++;
      
      if (differences > 1) return true;
      
      // Try to recover
      if (oldChordList.length > newChordList.length) {
        i++; // assume deletion
      } else if (oldChordList.length < newChordList.length) {
        j++; // assume insertion
      } else {
        i++; // assume substitution
        j++;
      }
    } else {
      i++;
      j++;
    }
  }
  
  // Add remaining lengths as differences
  differences += (oldChordList.length - i) + (newChordList.length - j);
  
  return differences > 1;
}
