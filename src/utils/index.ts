import { Keyboard } from './keyboard';
import type { Key } from './keyboard';

export interface Position {
	x: number;
	y: number;
}

/**
 * Returns a random number between min and max, with a bell curve distribution.
 * @param min - The minimum value.
 * @param max - The maximum value.
 * @param iterations - The number of iterations to run. (Higher = more accurate bell curve, 1 = no bell curve)
 */
export function humanRandomBellCurve(min: number, max: number, iterations = 5) {
	const range = max - min;

	let total = 0;
	for (let i = 0; i < iterations; i++) {
		const r = Math.random();
		total += r;
	}

	// Average multiple random values creates natural bell curve
	const value = total / iterations;

	// Scale to our range and round
	return min + Math.floor(value * range);
}

export async function handlePanicShutdown(keyToShutdownOn: Key) {
	await Keyboard.waitForKeyPress(keyToShutdownOn);
	console.info(`Shutting down because ${keyToShutdownOn} was pressed!`);
	process.exit(0);
}
