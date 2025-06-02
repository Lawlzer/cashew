import { throwError, sleep } from '@lawlzer/utils';
import { loadTypedBinding, type BindingSchema, createValidatedFunction } from './bindingLoader';
import { Keyboard } from './keyboard';
import type { Key } from './keyboard';
import type { Area, rgb } from './screen';

interface MiscBinding {
	SetForegroundWindow: (windowTitle: string) => Promise<boolean>;
	GetForegroundWindowTitle: () => Promise<string | null>;
}

// Define the schema for the misc binding
const miscBindingSchema: BindingSchema = {
	SetForegroundWindow: {
		type: 'function',
		params: [{ name: 'windowTitle', type: 'string' }],
		returnType: 'boolean',
	},
	GetForegroundWindowTitle: {
		type: 'function',
		params: [],
		returnType: 'string', // Note: can also return null, handled in validator
	},
};

// Custom validator for MiscBinding that handles the specific return types
function isMiscBinding(binding: unknown): binding is MiscBinding {
	return typeof binding === 'object' && binding !== null && 'SetForegroundWindow' in binding && 'GetForegroundWindowTitle' in binding && typeof (binding as any).SetForegroundWindow === 'function' && typeof (binding as any).GetForegroundWindowTitle === 'function';
}

// Load the binding with proper typing and validation
const miscBinding = loadTypedBinding<MiscBinding>('misc', miscBindingSchema, isMiscBinding);

// Create validated wrapper functions with runtime type checking
const setForegroundWindowValidated = createValidatedFunction(miscBinding.SetForegroundWindow, 'SetForegroundWindow', 'boolean');

const getForegroundWindowTitleValidated = createValidatedFunction(miscBinding.GetForegroundWindowTitle, 'GetForegroundWindowTitle', 'string', (value: unknown): value is string | null => typeof value === 'string' || value === null);

export async function setForegroundWindow(windowTitle: string): Promise<boolean> {
	return setForegroundWindowValidated(windowTitle);
}

export async function getForegroundWindowTitle(): Promise<string> {
	const result = await getForegroundWindowTitleValidated();
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
	onMessage: string | false | null;
	offMessage: string | false | null;
	initialState?: boolean;
	pollingInterval?: number;
}

// Map to store the last known state of keys for edge detection in polling
// This allows multiple independent monitors.
const keyPressStates = new Map<Key, boolean>();

// Initializes a toggle monitor that watches for key presses and toggles state.
// Each key press toggles between on/off states and calls the provided function.
// The monitor runs in the background.
export async function initToggleMonitor({
	key,
	func,
	onMessage = null,
	offMessage = null,
	initialState = false, // Default to OFF
	pollingInterval = 50, // Default to 50ms
}: InitToggleMonitorParams): Promise<void> {
	let isActive = initialState;

	if (isActive && typeof onMessage === 'string') {
		console.log(`Initializing toggle monitor for key "${key}". Initial state: ${onMessage}`);
	} else if (!isActive && typeof offMessage === 'string') {
		console.log(`Initializing toggle monitor for key "${key}". Initial state: ${offMessage}`);
	} else {
		console.log(`Initializing toggle monitor for key "${key}". Initial state: ${isActive ? 'ON' : 'OFF'}. (Custom messages disabled)`);
	}

	// Attempt to get initial key state.
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
						console.log(onMessage);
					} else if (!isActive && typeof offMessage === 'string') {
						console.log(offMessage);
					}
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

// Convenience function to create a toggle monitor with common defaults.
// Provides sensible defaults for onMessage, offMessage, initialState, and pollingInterval.
export async function createToggleMonitor(
	key: Key,
	callback: (isOn: boolean) => void,
	options: {
		onMessage?: string | false | null;
		offMessage?: string | false | null;
		initialState?: boolean; // Default handled by initToggleMonitor
		pollingInterval?: number; // Default handled by initToggleMonitor
	} = {}
): Promise<void> {
	const params: InitToggleMonitorParams = {
		key,
		func: callback,
		onMessage: options.onMessage === undefined ? `${key} toggled ON` : options.onMessage,
		offMessage: options.offMessage === undefined ? `${key} toggled OFF` : options.offMessage,
		initialState: options.initialState,
		pollingInterval: options.pollingInterval,
	};

	return initToggleMonitor(params);
}
