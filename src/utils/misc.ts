import { throwError } from '@lawlzer/utils';

import { loadBinding, type MiscBinding, type PanicShutdownBinding } from './bindingLoader';
import type { Key } from './keyboard';
import { Keyboard, stringToKeycode } from './keyboard';
import type { Area, rgb } from './screen';

const miscBinding = loadBinding<MiscBinding>('misc');
const panicShutdownBinding = loadBinding<PanicShutdownBinding>('panicShutdown');

type GlobalWithMiscBindingOverride = typeof globalThis & {
	__cashewMiscBindingOverride?: MiscBinding;
};

function getMiscBinding(): MiscBinding {
	return (globalThis as GlobalWithMiscBindingOverride).__cashewMiscBindingOverride ?? miscBinding;
}

export async function setForegroundWindow(windowTitle: string): Promise<boolean> {
	return getMiscBinding().SetForegroundWindow(windowTitle);
}

export async function getForegroundWindowTitle(): Promise<string> {
	try {
		const result = await getMiscBinding().GetForegroundWindowTitle();
		if (result === null) {
			console.warn('Failed to get foreground window title');
			return '';
		}
		return result;
	} catch (error) {
		console.warn('Failed to get foreground window title', error);
		return '';
	}
}

export interface Position {
	x: number;
	y: number;
}

/**
 * Returns a random number between min and max, with a bell curve distribution.
 * @param iterations - The number of iterations to run. (Higher = more accurate bell curve, 1 = no bell curve)
 */
export function randomBellCurve(min: number, max: number, iterations = 5): number {
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

export async function handlePanicShutdown(keyToShutdownOn: Key): Promise<void> {
	// Convert the key to a keycode using the unified mapping
	const keyCode = stringToKeycode.get(keyToShutdownOn.toLowerCase());
	if (keyCode === undefined) {
		throwError(`Key code not found for key: '${keyToShutdownOn}'`);
	}

	// Enable the native panic shutdown hook
	// This will work even if JavaScript is stuck in an infinite loop
	const success = await panicShutdownBinding.enablePanicShutdown(keyCode, keyToShutdownOn);

	if (success) {
		console.info(`Panic shutdown enabled for key: ${keyToShutdownOn}. Press this key to immediately terminate the process.`);
	} else {
		throwError('Failed to enable panic shutdown');
	}
}

/**
 * Determine if two RGB values are close enough (within a certain offset)
 */
export function isCorrectColour(pixel1: rgb, pixel2: rgb, maxOffset: number): boolean {
	const rOffset = Math.abs(pixel1.r - pixel2.r);
	const gOffset = Math.abs(pixel1.g - pixel2.g);
	const bOffset = Math.abs(pixel1.b - pixel2.b);

	return rOffset <= maxOffset && gOffset <= maxOffset && bOffset <= maxOffset;
}

/**
 * Turn an array of positions into an x, y, width, and height.
 */
export function getAreaOfPositions(positions: Position[]): Area {
	let xMin = positions[0].x;
	let xMax = positions[0].x;
	let yMin = positions[0].y;
	let yMax = positions[0].y;

	for (let i = 1; i < positions.length; i++) {
		const position = positions[i];
		xMin = Math.min(xMin, position.x);
		xMax = Math.max(xMax, position.x);
		yMin = Math.min(yMin, position.y);
		yMax = Math.max(yMax, position.y);
	}

	const width = xMax - xMin;
	const height = yMax - yMin;

	return { x: xMin, y: yMin, width, height };
}

// Configuration for initializing a toggle monitor that watches for key presses
// Describes the parameters for initToggleMonitor
export interface InitToggleMonitorParams {
	key: Key;
	func: (newState: boolean) => void;
	onMessage?: string | false | null;
	offMessage?: string | false | null;
	initialState?: boolean;
	pollingInterval?: number; // @deprecated No longer used - native hooks are used instead
	postToggleDelayMs?: number;
}

/**
 * Initialize a toggle monitor that watches for a specific key press and toggles state.
 * Uses native Windows keyboard hooks for efficient monitoring without polling.
 *
 * @param params Configuration for the toggle monitor
 * @returns Cleanup function to stop monitoring
 */
export function initToggleMonitor({
	key, //
	func,
	onMessage = null,
	offMessage = null,
	initialState = false,
	pollingInterval: _pollingInterval, // @deprecated — ignored, native hooks are used instead
	postToggleDelayMs = 250,
}: InitToggleMonitorParams): () => void {
	let isActive = initialState;
	let lastToggleTime = 0;

	if (isActive && typeof onMessage === 'string') {
		console.info(`Initializing toggle monitor for key "${key}". Initial state: ${onMessage}`);
	} else if (!isActive && typeof offMessage === 'string') {
		console.info(`Initializing toggle monitor for key "${key}". Initial state: ${offMessage}`);
	} else {
		console.info(`Initializing toggle monitor for key "${key}". Initial state: ${isActive ? 'ON' : 'OFF'}. (Custom messages disabled)`);
	}

	// Use the native keyboard hook for efficient monitoring
	const cleanup = Keyboard.onKeypress(
		key,
		(_event) => {
			const now = Date.now();
			// Debounce to prevent rapid toggling
			if (now - lastToggleTime < postToggleDelayMs) {
				return;
			}
			lastToggleTime = now;

			// Toggle the state
			isActive = !isActive;
			func(isActive); // Call the user's callback function

			// Log the state change
			if (isActive && typeof onMessage === 'string') {
				console.info(onMessage);
			} else if (!isActive && typeof offMessage === 'string') {
				console.info(offMessage);
			}
		},
		{ triggerOnce: true } // This ensures we only trigger on key press, not hold
	);

	// Return the cleanup function so the caller can stop monitoring when needed
	return cleanup;
}
