/**
 * YouTube ID extraction and embed URL helpers.
 *
 * extractYouTubeId() is the sole determinant of "can we attempt an embed" —
 * no other validation happens before an iframe is attempted (see AGENTS.md /
 * plan handoff §Part 2). It must be tolerant of the various real-world URL
 * shapes YouTube's own share/copy-link buttons produce, not just clean
 * hand-typed ones.
 */

// A YouTube video ID is 11 characters from this set. Some malformed/truncated
// IDs pasted from broken copy jobs won't match this and should be rejected
// rather than passed through to an iframe that will never resolve.
const YT_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function extractYouTubeId(url: string): string | null {
	if (!url) return null;

	let parsed: URL;
	try {
		parsed = new URL(url.trim());
	} catch {
		return null;
	}

	const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
	const isYouTubeHost =
		host === 'youtube.com' ||
		host === 'm.youtube.com' ||
		host === 'music.youtube.com' ||
		host === 'youtube-nocookie.com' ||
		host === 'youtu.be';

	if (!isYouTubeHost) return null;

	let id: string | null = null;

	if (host === 'youtu.be') {
		// youtu.be/ID  (path is /ID, possibly with trailing slash/extra segments)
		const segment = parsed.pathname.split('/').filter(Boolean)[0];
		id = segment ?? null;
	} else if (parsed.pathname.startsWith('/embed/')) {
		// youtube.com/embed/ID
		const segment = parsed.pathname.split('/').filter(Boolean)[1];
		id = segment ?? null;
	} else if (parsed.pathname.startsWith('/shorts/')) {
		// youtube.com/shorts/ID
		const segment = parsed.pathname.split('/').filter(Boolean)[1];
		id = segment ?? null;
	} else if (parsed.pathname === '/watch' || parsed.pathname === '/watch/') {
		// youtube.com/watch?v=ID&list=...&t=90s&si=...
		id = parsed.searchParams.get('v');
	}

	if (!id) return null;
	if (!YT_ID_PATTERN.test(id)) return null;

	return id;
}

export function getEmbedUrl(videoId: string): string {
	return `https://www.youtube.com/embed/${videoId}`;
}
