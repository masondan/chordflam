import { Chord } from 'tonal';

/**
 * Very basic key detection heuristic based on the chords of a song.
 * Guesses the key by looking at the first and last chord.
 * If they match, that's highly likely the key.
 * Otherwise, defers to the last chord as a primary indicator for many contemporary songs.
 */
export function detectKey(chordList: string[]): string {
  if (!chordList || chordList.length === 0) {
    return 'C'; // Fallback
  }

  const firstChord = chordList[0];
  const lastChord = chordList[chordList.length - 1];

  const extractKey = (chordSymbol: string) => {
    const [tonic, quality] = Chord.tokenize(chordSymbol);
    if (!tonic) return 'C';
    // If it's a minor chord, append 'm', otherwise just the tonic
    return quality.startsWith('m') && !quality.startsWith('maj') ? tonic + 'm' : tonic;
  };

  const firstKey = extractKey(firstChord);
  const lastKey = extractKey(lastChord);

  if (firstKey === lastKey) {
    return firstKey;
  }

  return lastKey || 'C';
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
