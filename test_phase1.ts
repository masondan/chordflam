import { parseSong, normalizeToBracketNotation } from './src/lib/utils/parser';
import { transposeRawText, transposeChord } from './src/lib/utils/transpose';
import { detectKey, isMajorEdit } from './src/lib/utils/keyDetection';
import { chordToPitchClasses } from './src/lib/utils/chordToKeys';

console.log('--- TEST PARSER ---');
const rawBracket = `[Am]Twinkle [C]twinkle [G]little star
[F]How I [C]wonder [G]what you are`;
console.log(JSON.stringify(parseSong(rawBracket), null, 2));

const rawPaste = `
Am      C       G
Twinkle twinkle little star
F     C      G
How I wonder what you are
`;
console.log(JSON.stringify(parseSong(rawPaste), null, 2));

console.log('\n--- TEST REAL UG PASTE (reported bug) ---');
const ugPaste = `                C                                  Am
I feel that room swaying, while the band's playing
        Gm7                C7                          F
One of your old favourite songs, from way back when.`;

const normalized = normalizeToBracketNotation(ugPaste);
console.log('Normalized bracket notation:\n' + normalized);

const ugParsed = parseSong(ugPaste);
console.log('Chord list:', ugParsed.chordList);
console.log('Parsed lines (reconstructed):');
for (const line of ugParsed.parsedLines) {
  let out = '';
  for (const seg of line.segments) {
    if (seg.chord) out += `[${seg.chord}]`;
    out += seg.lyric;
  }
  console.log(out);
}

console.log('\n--- TEST TRANSPOSE ---');
console.log('transpose C by +2:', transposeChord('C', 2)); // D
console.log('transpose Cmaj7/E by -2:', transposeChord('Cmaj7/E', -2)); // Bbmaj7/D
console.log('transposeRawText +2:', transposeRawText('[Am]Twinkle [C]twinkle', 2)); // [Bm]Twinkle [D]twinkle

console.log('\n--- TEST KEY DETECTION ---');
console.log('Key of [C, G, Am, F]:', detectKey(['C', 'G', 'Am', 'F'])); // C != F -> F? Wait, if it resolves to C, first chord C is better. Our heuristic returns last chord if different. Let's see.
console.log('Key of [Am, F, C, Am]:', detectKey(['Am', 'F', 'C', 'Am'])); // Am

console.log('\n--- TEST EDIT DETECTION ---');
console.log('Minor edit:', isMajorEdit(['C', 'G', 'Am'], ['C', 'G', 'Am', 'F'])); // false (<= 1 diff)
console.log('Major edit:', isMajorEdit(['C', 'G', 'Am'], ['F', 'G', 'C', 'Am'])); // true (> 1 diff)

console.log('\n--- TEST CHORD TO KEYS ---');
console.log('C major:', chordToPitchClasses('C')); // 0, 4, 7
console.log('Am/G:', chordToPitchClasses('Am/G')); // 0 (C), 4 (E), 7 (G), 9 (A) -> [0, 4, 7, 9]
