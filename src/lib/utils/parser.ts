import { type ParsedLine, type ParsedSegment } from '../db/db';

/**
 * Section markers that should not be treated as chords.
 * Matches patterns like [Verse], [Verse 1], [Verse 2], [Pre-Chorus], etc.
 */
const SECTION_MARKERS = [
  'Verse',
  'Chorus',
  'Bridge',
  'Intro',
  'Outro',
  'Pre-Chorus',
  'Interlude',
  'Solo',
  'Coda',
  'Instrumental'
];

/**
 * Regex to detect section markers with optional numbers/suffixes.
 * Matches: [Verse], [Verse 1], [Verse 2], [Pre-Chorus], etc.
 */
const sectionMarkerRegex = new RegExp(
  `^(${SECTION_MARKERS.join('|')})\\s*(\\d+)?\\s*$`,
  'i'
);

function isSectionMarker(text: string): boolean {
  return sectionMarkerRegex.test(text.trim());
}

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

  if (chords.length === 0) {
    return lyricLine;
  }

  // Real-world pastes (UG, Chordu, E-Chords, etc.) are rarely perfectly
  // column-aligned once copied through different renderers/fonts, so we
  // don't trust the raw character column directly. Instead, snap each
  // chord's column to the nearest word boundary in the lyric line:
  //  - if the column falls inside a word, the chord goes before that word
  //  - if it falls in a gap, it snaps to the next word's start
  //  - if it's beyond the last word (trailing/instrumental chord), it
  //    attaches at the end of the line instead of inside padded whitespace
  const words: { start: number; end: number }[] = [];
  const wordRegex = /\S+/g;
  let wordMatch;
  while ((wordMatch = wordRegex.exec(lyricLine)) !== null) {
    words.push({ start: wordMatch.index, end: wordMatch.index + wordMatch[0].length });
  }

  const snapIndex = (rawIndex: number): number => {
    for (const w of words) {
      if (rawIndex >= w.start && rawIndex < w.end) {
        return w.start;
      }
      if (rawIndex < w.start) {
        return w.start;
      }
    }
    return lyricLine.length;
  };

  const targets = chords.map((c) => ({ chord: c.chord, index: snapIndex(c.index) }));

  // Insert chords into lyrics from right to left so earlier indices don't shift
  let merged = lyricLine;
  for (let i = targets.length - 1; i >= 0; i--) {
    const { chord, index } = targets[i];
    // If attaching past the end of the lyric text (trailing/instrumental chord),
    // add a separating space so it doesn't fuse onto the last word.
    const prevChar = merged[index - 1];
    const needsSpace = index === merged.length && index > 0 && prevChar !== ' ';
    merged = merged.slice(0, index) + (needsSpace ? ' ' : '') + `[${chord}]` + merged.slice(index);
  }

  return merged.replace(/\s+$/, '');
}

/**
 * Formats a single ParsedLine into two display rows (chord row above lyric row),
 * suitable for monospace rendering as "chords over lyrics" — used by both the
 * Chord Actions preview canvas and Chord Reader.
 *
 * The lyric row always keeps its natural text/spacing exactly as parsed — it is
 * NEVER padded to make room for a chord label. Chord labels are positioned at the
 * column where their lyric segment begins, floating independently above the lyric
 * row (standard chord-chart convention). This deliberately avoids inserting extra
 * space characters into the lyric text, which previously caused visible double
 * spaces / word-gap drift whenever a chord name was wider than 1 character.
 */
export function formatParsedLineForDisplay(line: ParsedLine): { chordRow: string; lyricRow: string } {
  let chordRow = '';
  let lyricRow = '';

  for (const seg of line.segments) {
    if (seg.chord) {
      const col = lyricRow.length;
      if (chordRow.length < col) {
        // Pad the chord row up to the column where this lyric segment starts.
        chordRow += ' '.repeat(col - chordRow.length);
      } else if (chordRow.length > col) {
        // A previous (wider) chord label already extends past this column —
        // separate the two labels with a single space rather than gluing them
        // together or shifting the lyric text.
        chordRow += ' ';
      }
      chordRow += seg.chord;
    }
    lyricRow += seg.lyric;
  }

  return {
    chordRow: chordRow.replace(/\s+$/, ''),
    lyricRow: lyricRow.replace(/\s+$/, '')
  };
}

/**
 * Parses bracket notation raw text into structured ParsedLine array and a unique chord list.
 * Also returns the normalised bracket-notation text so callers can persist it back as the
 * canonical `rawText` — per the plan, rawText IS bracket notation, so a raw chords-over-lyrics
 * paste is converted once (on first "Chord It") and from then on is edited as bracket notation.
 */
export function parseSong(rawText: string): { parsedLines: ParsedLine[], chordList: string[], normalizedText: string } {
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
       const isSection = isSectionMarker(chord);
       
       if (chord) {
         // Only add to chord list if it's not a section marker
         if (!isSection && !chordSet.has(chord)) {
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
       
       // For section markers, don't include them as a chord — just treat as lyric text
       if (isSection) {
         segments.push({ chord: null, lyric: chord + lyricAfter });
       } else {
         segments.push({ chord: chord, lyric: lyricAfter });
       }
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
     chordList,
     normalizedText
   };
 }
