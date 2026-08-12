import { extractYouTubeId, getEmbedUrl } from './src/lib/utils/videoEmbed';

console.log('--- TEST videoEmbed.ts against real pasted URL shapes ---');

const cases: [string, string | null][] = [
	// Standard watch URL
	['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
	// Short link
	['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
	// Watch URL with playlist + timestamp extra params
	[
		'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1&t=90s',
		'dQw4w9WgXcQ'
	],
	// Embed URL
	['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
	// Mobile host
	['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
	// Share-tracking si= param on youtu.be
	['https://youtu.be/dQw4w9WgXcQ?si=AbCdEfGhIjKlMnOp', 'dQw4w9WgXcQ'],
	// Share-tracking si= param on watch URL
	['https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=AbCdEfGhIjKlMnOp', 'dQw4w9WgXcQ'],
	// Shorts
	['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
	// music.youtube.com
	['https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'dQw4w9WgXcQ'],
	// youtube-nocookie embed domain
	['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
	// No protocol — new URL() will throw, this is expected to fail structural
	// validation upstream (Chord Actions URL input) before ever reaching here,
	// but extractYouTubeId itself should still fail closed, not throw.
	['www.youtube.com/watch?v=dQw4w9WgXcQ', null],
	// Non-YouTube — always null, falls back to external-link path in Reader
	['https://vimeo.com/12345678', null],
	['https://www.google.com', null],
	// Malformed / truncated video ID
	['https://www.youtube.com/watch?v=short', null],
	['https://youtu.be/', null],
	['not a url at all', null],
	['', null]
];

let pass = 0;
for (const [input, expected] of cases) {
	const actual = extractYouTubeId(input);
	const ok = actual === expected;
	if (ok) pass++;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(input)}  ->  ${actual}  (expected ${expected})`);
}
console.log(`\n${pass}/${cases.length} passed`);

console.log('\n--- TEST getEmbedUrl ---');
console.log(getEmbedUrl('dQw4w9WgXcQ'));
