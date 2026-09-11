/**
 * Dynamic-width line wrapping for chord-over-lyric display rows.
 *
 * Problem this solves (see info/handoff-line-wrapping-fix.md): a naive CSS
 * `white-space: pre-wrap` on the chord row and lyric row independently does
 * NOT keep them column-aligned once wrapping kicks in — each row can wrap at
 * a different point, orphaning a chord from the lyric syllable it belongs
 * above. This module computes a single shared break point for both rows (in
 * monospace character-column space) so a wrapped line always keeps its
 * chords correctly positioned over its lyrics — exactly as if the user had
 * pressed Enter there manually.
 *
 * This is a display-only transform: it operates on the two already-rendered
 * strings from `formatParsedLineForDisplay()` and never touches `rawText`,
 * the parser, or the data model.
 */

/**
 * Splits a single chord/lyric row pair into one or more visual sub-lines,
 * each no wider than `maxChars` columns, breaking only at whitespace
 * boundaries in either row (never splitting a word or a chord symbol).
 *
 * If `maxChars` isn't a usable positive number (e.g. width hasn't been
 * measured yet), the pair is returned unmodified as a single "line" —
 * callers should default `maxChars` generously large until a real
 * measurement is available, so first paint never looks worse than before
 * this fix.
 */
export function wrapChordLyricLine(
	chordRow: string,
	lyricRow: string,
	maxChars: number
): { chordRow: string; lyricRow: string }[] {
	if (!Number.isFinite(maxChars) || maxChars <= 0) {
		return [{ chordRow, lyricRow }];
	}

	const result: { chordRow: string; lyricRow: string }[] = [];
	let cRow = chordRow;
	let lRow = lyricRow;

	// Safety cap to guarantee termination even in pathological inputs —
	// every iteration below is guaranteed to consume at least one character,
	// so this can never legitimately be reached, but a hard stop is cheap
	// insurance against an infinite loop shipping to production.
	let guard = 0;
	const guardMax = Math.max(chordRow.length, lyricRow.length, 1) + 10;

	while (Math.max(cRow.length, lRow.length) > maxChars) {
		guard++;
		if (guard > guardMax) {
			result.push({ chordRow: cRow.trimEnd(), lyricRow: lRow.trimEnd() });
			cRow = '';
			lRow = '';
			break;
		}

		const breakAt = findBreakPoint(cRow, lRow, maxChars);

		result.push({
			chordRow: cRow.slice(0, breakAt).trimEnd(),
			lyricRow: lRow.slice(0, breakAt).trimEnd()
		});

		cRow = cRow.slice(breakAt);
		lRow = lRow.slice(breakAt);
	}

	result.push({ chordRow: cRow.trimEnd(), lyricRow: lRow.trimEnd() });
	return result;
}

/**
 * Finds the column at which to break both rows together. Starts at the raw
 * character-count limit (`maxChars`) and snaps backwards to avoid splitting
 * a word (in the lyric row) or a chord symbol (in the chord row), iterating
 * a few times since satisfying one constraint can land inside the other
 * token. Falls back to a hard break at `maxChars` if a single token is wider
 * than the available width — there's nowhere earlier to go, so the sub-line
 * runs slightly wide rather than looping forever or producing an empty line.
 */
function findBreakPoint(chordRow: string, lyricRow: string, maxChars: number): number {
	let breakAt = maxChars;

	for (let i = 0; i < 10; i++) {
		const before = breakAt;
		breakAt = snapToTokenBoundary(lyricRow, breakAt);
		breakAt = snapToTokenBoundary(chordRow, breakAt);
		if (breakAt === before) break;
	}

	if (breakAt <= 0) {
		breakAt = maxChars;
	}

	return breakAt;
}

/**
 * If `breakAt` falls inside a contiguous non-space run ("token" — a word in
 * the lyric row, or a chord label in the chord row), snaps it back to the
 * start of that token. If the token itself starts at column 0 (it's simply
 * too wide to fit in `maxChars` at all), leaves the break where it is —
 * there's no earlier boundary to snap to.
 */
function snapToTokenBoundary(row: string, breakAt: number): number {
	if (breakAt >= row.length) return breakAt;
	if (row[breakAt] === ' ') return breakAt;

	const tokenRegex = /\S+/g;
	let match: RegExpExecArray | null;
	while ((match = tokenRegex.exec(row)) !== null) {
		const start = match.index;
		const end = start + match[0].length;
		if (breakAt >= start && breakAt < end) {
			return start;
		}
	}
	return breakAt;
}

// --- Width measurement helpers ---
//
// A single off-screen <canvas> is reused for all measurements — cheaper than
// creating/measuring a real DOM element per call, and avoids ever inserting
// a probe node into the visible tree. `measureCharWidth` is memoised per
// (fontSizePx, fontFamily) pair since the canvas font string parse + measure
// is not free and this can run on every render during a resize.

let sharedCanvas: HTMLCanvasElement | null = null;
const charWidthCache = new Map<string, number>();

function getMeasureContext(): CanvasRenderingContext2D | null {
	if (typeof document === 'undefined') return null;
	if (!sharedCanvas) {
		sharedCanvas = document.createElement('canvas');
	}
	return sharedCanvas.getContext('2d');
}

/**
 * Returns the pixel width of a single monospace character at the given font
 * size/family, using canvas text measurement. Returns 0 if measurement isn't
 * possible (e.g. SSR/no document) — callers should treat 0 as "unknown" and
 * fall back to unwrapped display rather than dividing by it.
 */
export function measureCharWidth(fontSizePx: number, fontFamily: string): number {
	const key = `${fontSizePx}px ${fontFamily}`;
	const cached = charWidthCache.get(key);
	if (cached !== undefined) return cached;

	const ctx = getMeasureContext();
	if (!ctx) return 0;

	ctx.font = key;
	// Monospace fonts render every character at the same advance width, so
	// measuring one representative character gives the column width used
	// throughout the chord/lyric grid.
	const width = ctx.measureText('0').width;
	charWidthCache.set(key, width);
	return width;
}

/**
 * Converts an available container width in pixels into a usable column
 * count (`maxChars`) for `wrapChordLyricLine`, at the given font size/family.
 * Returns `Infinity` if width can't be determined yet, so callers naturally
 * fall back to "no wrapping" (single line, matches pre-fix behaviour) rather
 * than mis-wrapping against a bogus 0-width measurement.
 */
export function computeMaxChars(
	containerWidthPx: number,
	fontSizePx: number,
	fontFamily: string
): number {
	if (!containerWidthPx || containerWidthPx <= 0) return Infinity;
	const chWidth = measureCharWidth(fontSizePx, fontFamily);
	if (!chWidth) return Infinity;
	return Math.floor(containerWidthPx / chWidth);
}
