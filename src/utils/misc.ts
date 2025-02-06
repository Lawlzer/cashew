import { throwError } from '@lawlzer/utils';
import bindings from 'bindings';
import { Keyboard } from './keyboard';
import type { Key } from './keyboard';
import type { rgb } from './screen';

const miscBinding = bindings('misc') ?? throwError('Could not load misc binding');

export async function setForegroundWindow(windowTitle: string) {
	await miscBinding.SetForegroundWindow(windowTitle);
}

export async function getForegroundWindowTitle() {
	const result = await miscBinding.GetForegroundWindowTitle();
	if (typeof result !== 'string') throwError('result was not a string: ', result);
	return result;
}

export interface Position {
	x: number;
	y: number;
}

/**
 * Returns a random number between min and max, with a bell curve distribution.
 * @param iterations - The number of iterations to run. (Higher = more accurate bell curve, 1 = no bell curve)
 */
export function randomBellCurve(min: number, max: number, iterations = 5) {
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

/**
 * Determine if two RGB values are close enough (within a certain offset)
 */
export function isCorrectColour(pixel1: rgb, pixel2: rgb, maxOffset: number) {
	const rOffset = Math.abs(pixel1.r - pixel2.r);
	const gOffset = Math.abs(pixel1.g - pixel2.g);
	const bOffset = Math.abs(pixel1.b - pixel2.b);

	return rOffset <= maxOffset && gOffset <= maxOffset && bOffset <= maxOffset;
}
