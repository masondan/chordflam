import { type ParsedLine, type ParsedSegment } from '../db/db';

/**
 * Normalises raw text by converting "chords over lyrics" format to bracket notation.
 * If the text already looks like bracket notation, it returns it mostly as-is.
 */
export function normalizeToBracketNotation(rawText: string): string {
  const lines = rawText.split('\n');
  const normalizedLines: string[] = [];

  // A very basic heuristic for a chord line:
  // - Mostly spaces, and short words that look like chords (e.g. C, Am, G7, F#m, Bb)
  // - Doesn't contain regular words.
  const chordLineRegex = /^(\s*[A-G](?:#|b)?(?:m|maj|min|aug|dim|sus|add|\d)*\s*)+$/;

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const trimmedLine = currentLine.trim();

    // Skip empty lines
    if (trimmedLine === '') {
      normalizedLines.push('');
      continue;
    }

    // If it's a chord line, check the next line
    if (chordLineRegex.test(trimmedLine) && currentLine.trim() !== '') {
      const nextLine = (i + 1 < lines.length) ? lines[i + 1] : null;

      // If next line is not a chord line and not empty, it's likely the lyrics for these chords
      if (nextLine !== null && !chordLineRegex.test(nextLine) && nextLine.trim() !== '' && !nextLine.includes('[')) {
        // Merge the chords into the lyrics
        normalizedLines.push(mergeChordsAndLyrics(currentLine, nextLine));
        i++; // Skip the next line as it's been consumed
      } else {
        // It's a standalone chord line (e.g., an intro or just chords)
        normalizedLines.push(wrapChordsInBrackets(currentLine));
      }
    } else {
      // Regular line (either already bracket notation or pure lyrics/text)
      normalizedLines.push(currentLine);
    }
  }

  return normalizedLines.join('\n');
}

function wrapChordsInBrackets(chordLine: string): string {
  return chordLine.replace(/([A-G][^\s]*)/g, '[$1]');
}

function mergeChordsAndLyrics(chordLine: string, lyricLine: string): string {
  const chords: { chord: string; index: number }[] = [];
  const regex = /([A-G][^\s]*)/g;
  let match;

  while ((match = regex.exec(chordLine)) !== null) {
    chords.push({
      chord: match[1],
      index: match.index
    });
  }

  // Insert chords into lyrics from right to left so indices don't shift
  let merged = lyricLine;
  // If lyric line is shorter than chord line, pad it with spaces
  if (merged.length < chordLine.length) {
    merged = merged.padEnd(chordLine.length, ' ');
  }

  for (let i = chords.length - 1; i >= 0; i--) {
    const { chord, index } = chords[i];
    // Insert `[Chord]` at the specific index
    merged = merged.slice(0, index) + `[${chord}]` + merged.slice(index);
  }

  // Remove multiple spaces that might have been added by padding, but keep semantic spaces
  return merged.replace(/\s+$/, '');
}

/**
 * Parses bracket notation raw text into structured ParsedLine array and a unique chord list.
 */
export function parseSong(rawText: string): { parsedLines: ParsedLine[], chordList: string[] } {
  const normalizedText = normalizeToBracketNotation(rawText);
  const lines = normalizedText.split('\n');
  const parsedLines: ParsedLine[] = [];
  const chordSet = new Set<string>();
  const chordList: string[] = []; // maintain order of first appearance

  lines.forEach((line, index) => {
    const segments: ParsedSegment[] = [];
    
    // Split by brackets
    // Regex matches [Chord] and captures 'Chord'
    const bracketRegex = /\[(.*?)\]/g;
    let lastIndex = 0;
    let match;

    while ((match = bracketRegex.exec(line)) !== null) {
      // Text before the chord
      if (match.index > lastIndex) {
        const lyricBefore = line.slice(lastIndex, match.index);
        segments.push({ chord: null, lyric: lyricBefore });
      }

      const chord = match[1].trim();
      if (chord) {
        if (!chordSet.has(chord)) {
          chordSet.add(chord);
          chordList.push(chord);
        }
      }

      // We don't push the chord yet, because we need to attach it to the following lyric
      // We'll peek ahead to see the next text
      lastIndex = bracketRegex.lastIndex;
      
      // Let's find the text until the next bracket or end of line
      const nextMatchIndex = line.indexOf('[', lastIndex);
      const lyricAfter = nextMatchIndex !== -1 
        ? line.slice(lastIndex, nextMatchIndex) 
        : line.slice(lastIndex);
        
      segments.push({ chord: chord, lyric: lyricAfter });
      lastIndex += lyricAfter.length;
    }

    // If there were no chords, or text remains after the last chord (which shouldn't happen with the logic above)
    if (lastIndex < line.length && segments.length === 0) {
      segments.push({ chord: null, lyric: line });
    } else if (segments.length === 0) {
       segments.push({ chord: null, lyric: '' });
    }

    parsedLines.push({
      id: `line-${index}-${Math.random().toString(36).substr(2, 9)}`,
      segments
    });
  });

  return {
    parsedLines,
    chordList
  };
}
