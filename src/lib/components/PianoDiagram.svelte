<script lang="ts">
	import { chordToPitchClasses } from '$lib/utils/chordToKeys';

	let { chordName }: { chordName: string } = $props();

	// Two-octave keyboard, pitch-class 0 (C) through 11 (B), repeated twice.
	// Layout constants tuned for a compact SVG diagram roughly matching the
	// reference keyboard-visual.png proportions.
	const WHITE_KEY_WIDTH = 20;
	const WHITE_KEY_HEIGHT = 70;
	const BLACK_KEY_WIDTH = 12;
	const BLACK_KEY_HEIGHT = 44;
	const OCTAVES = 2;
	const WHITE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
	const BLACK_KEY_AFTER = new Set([0, 2, 5, 7, 9]); // black key sits after these white keys (C#, D#, F#, G#, A#)

	const whiteKeys = $derived.by(() => {
		const keys: { pc: number; x: number }[] = [];
		let x = 0;
		for (let oct = 0; oct < OCTAVES; oct++) {
			for (const pc of WHITE_PITCH_CLASSES) {
				keys.push({ pc, x });
				x += WHITE_KEY_WIDTH;
			}
		}
		return keys;
	});

	const blackKeys = $derived.by(() => {
		const keys: { pc: number; x: number }[] = [];
		let whiteIndex = 0;
		for (let oct = 0; oct < OCTAVES; oct++) {
			for (const pc of WHITE_PITCH_CLASSES) {
				if (BLACK_KEY_AFTER.has(pc)) {
					const x = whiteIndex * WHITE_KEY_WIDTH + WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;
					keys.push({ pc: pc + 1, x });
				}
				whiteIndex++;
			}
		}
		return keys;
	});

	const totalWidth = $derived(whiteKeys.length * WHITE_KEY_WIDTH);

	const activePitchClasses = $derived(new Set(chordToPitchClasses(chordName)));
</script>

<div class="piano-diagram">
	<div class="chord-label">{chordName}</div>
	<svg viewBox="0 0 {totalWidth} {WHITE_KEY_HEIGHT}" width={totalWidth} height={WHITE_KEY_HEIGHT}>
		{#each whiteKeys as key (key.x)}
			<rect
				x={key.x}
				y="0"
				width={WHITE_KEY_WIDTH}
				height={WHITE_KEY_HEIGHT}
				class="white-key"
				class:active={activePitchClasses.has(key.pc)}
			/>
			{#if activePitchClasses.has(key.pc)}
				<circle
					cx={key.x + WHITE_KEY_WIDTH / 2}
					cy={WHITE_KEY_HEIGHT - 14}
					r="5"
					class="dot"
				/>
			{/if}
		{/each}
		{#each blackKeys as key (key.x)}
			<rect
				x={key.x}
				y="0"
				width={BLACK_KEY_WIDTH}
				height={BLACK_KEY_HEIGHT}
				class="black-key"
				class:active={activePitchClasses.has(key.pc)}
			/>
			{#if activePitchClasses.has(key.pc)}
				<circle
					cx={key.x + BLACK_KEY_WIDTH / 2}
					cy={BLACK_KEY_HEIGHT - 10}
					r="4"
					class="dot dot-on-black"
				/>
			{/if}
		{/each}
	</svg>
</div>

<style>
	.piano-diagram {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
	}
	.chord-label {
		font-weight: 700;
		color: var(--text-primary);
		font-size: var(--text-h3);
	}
	.white-key {
		fill: white;
		stroke: var(--color-border);
		stroke-width: 1;
	}
	.white-key.active {
		fill: var(--color-highlight);
	}
	.black-key {
		fill: var(--text-primary);
		stroke: var(--text-primary);
	}
	.black-key.active {
		fill: var(--accent-brand);
	}
	.dot {
		fill: var(--accent-brand);
	}
	.dot-on-black {
		fill: white;
	}
</style>
