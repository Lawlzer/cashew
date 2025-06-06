import { sleep, throwError } from '@lawlzer/utils';

import { loadBinding, type MiscBinding, miscSchema, type PanicShutdownBinding, panicShutdownSchema } from './bindingLoader';
import type { Key } from './keyboard';
import { Keyboard } from './keyboard';
import type { Area, rgb } from './screen';

// Load the binding with the new Valibot-based loader
const miscBinding = loadBinding<MiscBinding>('misc', miscSchema);
const panicShutdownBinding = loadBinding<PanicShutdownBinding>('panicShutdown', panicShutdownSchema);

export async function setForegroundWindow(windowTitle: string): Promise<boolean> {
	return miscBinding.SetForegroundWindow(windowTitle);
}

export async function getForegroundWindowTitle(): Promise<string> {
	const result = await miscBinding.GetForegroundWindowTitle();
	if (result === null) throwError('Failed to get foreground window title');
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
	// Convert the key to a keycode
	const keyAddonMap = {
		// backspace: 8, // untested
		'\t': 9,
		tab: 9,
		clear: 12,
		enter: 13,
		alt: 18,
		'0': 48,
		'1': 49,
		'2': 50,
		'3': 51,
		'4': 52,
		'5': 53,
		'6': 54,
		'7': 55,
		'8': 56,
		'9': 57,
		a: 65,
		b: 66,
		c: 67,
		d: 68,
		e: 69,
		f: 70,
		g: 71,
		h: 72,
		i: 73,
		j: 74,
		k: 75,
		l: 76,
		m: 77,
		n: 78,
		o: 79,
		p: 80,
		q: 81,
		r: 82,
		s: 83,
		t: 84,
		u: 85,
		v: 86,
		w: 87,
		x: 88,
		y: 89,
		z: 90,
		LeftWindowsKey: 91,
		F1: 112,
		F2: 113,
		F3: 114,
		F4: 115,
		F5: 116,
		F6: 117,
		F7: 118,
		F8: 119,
		F9: 120,
		F10: 121,
		F11: 122,
		F12: 123,
		F13: 124,
		F14: 125,
		F15: 126,
		F16: 127,
		F17: 128,
		F18: 129,
		F19: 130,
		F20: 131,
		F21: 132,
		F22: 133,
		F23: 134,
		F24: 135,
		leftClick: 1,
		rightClick: 2,
		cancel: 3,
		middleClick: 4,
		back: 8,
		return: 13,
		shift: 16,
		control: 17,
		menu: 18,
		pause: 19,
		escape: 27,
		space: 32,
		' ': 32,
		pageUp: 33,
		pageDown: 34,
		end: 35,
		home: 36,
		leftArrow: 37,
		upArrow: 38,
		rightArrow: 39,
		downArrow: 40,
		numpad0: 96,
		numpad1: 97,
		numpad2: 98,
		numpad3: 99,
		numpad4: 100,
		numpad5: 101,
		numpad6: 102,
		numpad7: 103,
		numpad8: 104,
		numpad9: 105,
		multiply: 106,
		add: 107,
		separator: 108,
		subtract: 109,
		decimal: 110,
		divide: 111,
		leftShift: 160,
		rightShift: 161,
		leftControl: 162,
		rightControl: 163,
		leftAlt: 164,
		rightAlt: 165,
		volumeMute: 173,
		volumeDown: 174,
		volumeUp: 175,
		';': 184, // keyboard dependent?
		maybeSemicolon: 184, // keyboard dependent?
		'+': 187,
		plus: 187,
		',': 188,
		comma: 188,
		'-': 189,
		dash: 189,
		minus: 189,
		'.': 190,
		period: 190,
	} as const;

	const keyCode = keyAddonMap[keyToShutdownOn];
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
export function isCorrectColour(pixel1: rgb, pixel2: rgb, maxOffset: number) {
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
	pollingInterval?: number;
	postToggleDelayMs?: number;
}

const keyPressStates = new Map<Key, boolean>();
export async function initToggleMonitor({
	key, //
	func,
	onMessage = null,
	offMessage = null,
	initialState = false,
	pollingInterval = 20,
	postToggleDelayMs = 250,
}: InitToggleMonitorParams): Promise<void> {
	let isActive = initialState;

	if (isActive && typeof onMessage === 'string') {
		console.info(`Initializing toggle monitor for key "${key}". Initial state: ${onMessage}`);
	} else if (!isActive && typeof offMessage === 'string') {
		console.info(`Initializing toggle monitor for key "${key}". Initial state: ${offMessage}`);
	} else {
		console.info(`Initializing toggle monitor for key "${key}". Initial state: ${isActive ? 'ON' : 'OFF'}. (Custom messages disabled)`);
	}

	try {
		keyPressStates.set(key, await Keyboard.isKeyPressed(key));
	} catch (e) {
		console.error(`Error initializing key state for "${key}" via Keyboard.isKeyPressed. Ensure Keyboard is loaded and the method exists. Monitor may not function correctly.`, e);
		keyPressStates.set(key, false); // Assume not pressed if an error occurs
	}

	// IIFE for the monitoring loop, runs in background for this specific key
	(async () => {
		while (true) {
			try {
				const currentKeyState = await Keyboard.isKeyPressed(key);
				const previousKeyState = keyPressStates.get(key) ?? false;

				if (currentKeyState && !previousKeyState) {
					// Rising edge: key was just pressed
					isActive = !isActive;
					func(isActive); // Call the user's callback function
					if (isActive && typeof onMessage === 'string') {
						console.info(onMessage);
					} else if (!isActive && typeof offMessage === 'string') {
						console.info(offMessage);
					}
					await sleep(postToggleDelayMs); // Wait after processing the toggle
				}
				keyPressStates.set(key, currentKeyState); // Update the stored state for this key
				await sleep(pollingInterval);
			} catch (error) {
				console.error(`Error in toggle monitor for key "${key}":`, error);
				// Avoid busy-looping on errors
				await sleep(1000);
			}
		}
	})().catch((unhandledError) => {
		// This catches an error if the async IIFE itself fails catastrophically
		console.error(`Unhandled critical error in monitor loop for key "${key}". The monitor for this key will stop.`, unhandledError);
	});
}
