<script lang="ts">
	import { chordToPitchClasses } from '$lib/utils/chordToKeys';

	let { chordName }: { chordName: string } = $props();

	// Fixed reference keyboard (§6.2) — roughly one octave plus a few keys
	// either side (~10 white keys), matching the UG reference diagram. The
	// keyboard itself never shifts per-chord; only the dots move. It always
	// starts at C so every pitch class (0–11) is guaranteed to appear within
	// the first 7 white keys' worth of white+black keys — the trailing keys
	// are just visual padding, matching the reference's proportions.
	const WHITE_KEY_COUNT = 10;
	const WHITE_KEY_WIDTH = 18;
	const WHITE_KEY_HEIGHT = 64;
	const BLACK_KEY_WIDTH = 11;
	const BLACK_KEY_HEIGHT = 40;
	const WHITE_CORNER_RADIUS = 3;
	const BLACK_CORNER_RADIUS = 2;
	const WHITE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
	const BLACK_KEY_AFTER = new Set([0, 2, 5, 7, 9]); // black key sits after these white keys (C#, D#, F#, G#, A#)

	type KeyType = 'white' | 'black';

	/** Path for a rect with square top corners and slightly rounded bottom corners. */
	function roundedBottomRectPath(x: number, y: number, w: number, h: number, r: number): string {
		return `M ${x},${y} H ${x + w} V ${y + h - r} A ${r},${r} 0 0 1 ${x + w - r},${y + h} H ${x + r} A ${r},${r} 0 0 1 ${x},${y + h - r} Z`;
	}

	const whiteKeys = $derived.by(() => {
		const keys: { pc: number; x: number; type: KeyType }[] = [];
		for (let i = 0; i < WHITE_KEY_COUNT; i++) {
			const pc = WHITE_PITCH_CLASSES[i % WHITE_PITCH_CLASSES.length];
			keys.push({ pc, x: i * WHITE_KEY_WIDTH, type: 'white' });
		}
		return keys;
	});

	const blackKeys = $derived.by(() => {
		const keys: { pc: number; x: number; type: KeyType }[] = [];
		for (let i = 0; i < WHITE_KEY_COUNT; i++) {
			const pc = WHITE_PITCH_CLASSES[i % WHITE_PITCH_CLASSES.length];
			if (BLACK_KEY_AFTER.has(pc)) {
				const x = i * WHITE_KEY_WIDTH + WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;
				keys.push({ pc: pc + 1, x, type: 'black' });
			}
		}
		return keys;
	});

	const totalWidth = $derived(whiteKeys.length * WHITE_KEY_WIDTH + BLACK_KEY_WIDTH / 2);

	// Basic triad (root, 3rd, 5th — plus slash-chord bass if present) per §6.1.
	// Returned as an ordered array: [root, 3rd, 5th, ?bass].
	const pitchClassArray = $derived(chordToPitchClasses(chordName));

	// Each note in the ordered array gets exactly one dot, placed at the first
	// (leftmost) key that matches that pitch class and is at or to the right
	// of the previous dot. This ensures the diagram always reads left-to-right
	// as root→3rd→5th, matching the UG reference layout.
	const dotKeys = $derived.by(() => {
		const allKeys = [...whiteKeys, ...blackKeys].sort((a, b) => a.x - b.x);
		const result = new Set<string>();
		let minX = -Infinity; // Start searching from the leftmost key

		for (const targetPc of pitchClassArray) {
			// Find the first key with this pitch class at or to the right of minX
			for (const key of allKeys) {
				if (key.pc === targetPc && key.x >= minX) {
					result.add(`${key.type}-${key.x}`);
					minX = key.x; // Next note must be at or to the right of this one
					break;
				}
			}
		}
		return result;
	});
</script>

<div class="piano-diagram">
	<div class="chord-label">{chordName}</div>
	<svg viewBox="0 0 {totalWidth} {WHITE_KEY_HEIGHT}" width={totalWidth} height={WHITE_KEY_HEIGHT}>
		{#each whiteKeys as key (key.x)}
			<path
				d={roundedBottomRectPath(key.x, 0, WHITE_KEY_WIDTH, WHITE_KEY_HEIGHT, WHITE_CORNER_RADIUS)}
				class="white-key"
			/>
		{/each}
		{#each blackKeys as key (key.x)}
			<path
				d={roundedBottomRectPath(key.x, 0, BLACK_KEY_WIDTH, BLACK_KEY_HEIGHT, BLACK_CORNER_RADIUS)}
				class="black-key"
			/>
		{/each}
		{#each whiteKeys as key (key.x)}
			{#if dotKeys.has(`white-${key.x}`)}
				<circle
					cx={key.x + WHITE_KEY_WIDTH / 2}
					cy={WHITE_KEY_HEIGHT - 12}
					r="4"
					class="dot dot-on-white"
				/>
			{/if}
		{/each}
		{#each blackKeys as key (key.x)}
			{#if dotKeys.has(`black-${key.x}`)}
				<circle
					cx={key.x + BLACK_KEY_WIDTH / 2}
					cy={BLACK_KEY_HEIGHT - 9}
					r="3.5"
					class="dot dot-on-black"
				/>
			{/if}
		{/each}
	</svg>
</div>

<style>
	/* No purple/brand colour anywhere in this component — plain black/white/grey
	   only, matching the UG reference exactly (§6 fix). */
	.piano-diagram {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
		width: 100%;
		min-width: 0;
	}
	.piano-diagram svg {
		width: 100%;
		height: auto;
		max-width: 100%;
	}
	.chord-label {
		font-weight: 700;
		color: var(--text-primary);
		font-size: var(--text-h3);
	}
	.white-key {
		fill: white;
		stroke: #1f1f1f;
		stroke-width: 1;
	}
	.black-key {
		fill: #1f1f1f;
		stroke: #1f1f1f;
		stroke-width: 1;
	}
	.dot {
		stroke: none;
	}
	.dot-on-white {
		fill: #1f1f1f;
	}
	.dot-on-black {
		fill: white;
		stroke: #1f1f1f;
		stroke-width: 1;
	}
</style>
