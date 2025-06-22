import { throwError } from '@lawlzer/utils';
import * as path from 'path';
import * as v from 'valibot';

import { type Key, stringToKeycode } from './keyboard';

// Dynamic require function to avoid TypeScript issues with native bindings
function dynamicRequire(moduleId: string): any {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require(moduleId);
}

// Load the native binding directly without promise wrapping
function loadKeyboardSyncBinding(): KeyboardSyncBinding {
	const bindingName = 'keyboardSync.node';

	// Build comprehensive list of paths to try
	const cwd = process.cwd();
	const paths = [
		// Direct paths from dist
		path.join(__dirname, '../../build/Release', bindingName),
		path.join(__dirname, '../build/Release', bindingName),
		path.join(__dirname, 'build/Release', bindingName),

		// Paths relative to current working directory
		path.join(cwd, 'dist/build/Release', bindingName),
		path.join(cwd, 'build/Release', bindingName),

		// When installed as dependency
		path.join(cwd, 'node_modules/@lawlzer/cashew/dist/build/Release', bindingName),
		path.join(cwd, 'node_modules/@lawlzer/cashew/build/Release', bindingName),
	];

	// Try to load from each path
	for (const bindingPath of paths) {
		try {
			const binding = dynamicRequire(bindingPath);
			// Quick validation
			if (binding && typeof binding.isKeyPressedSync === 'function') {
				return binding as KeyboardSyncBinding;
			}
		} catch {
			// Try next path
		}
	}

	// Last resort - try direct require
	try {
		const binding = dynamicRequire('keyboardSync');
		if (binding && typeof binding.isKeyPressedSync === 'function') {
			return binding as KeyboardSyncBinding;
		}
	} catch {
		// Will throw below
	}

	throwError(`Could not load keyboardSync binding. Searched paths:\n${paths.map((p) => `  - ${p}`).join('\n')}`);
}

// Schema for synchronous keyboard binding
export const keyboardSyncSchema = v.object({
	isKeyPressedSync: v.any(),
	areKeysPressed: v.any(),
	getPressedKeys: v.any(),
	sendKeyBatch: v.any(),
	getRawKeyState: v.any(),
	isKeyPressedAlt: v.any(),
});

export interface KeyboardSyncBinding {
	isKeyPressedSync: (keyCode: number) => boolean;
	areKeysPressed: (keyCodes: number[]) => boolean[];
	getPressedKeys: () => number[];
	sendKeyBatch: (events: { keyCode: number; isDown: boolean }[]) => boolean;
	getRawKeyState: (keyCode: number) => {
		asyncState: number;
		asyncStateHex: string;
		isPressed: boolean;
		wasPressed: boolean;
		keyboardState: number;
		kbStatePressed: boolean;
	};
	isKeyPressedAlt: (keyCode: number) => boolean;
}

// Load the synchronous binding directly without promise wrapping
const keyboardSyncBinding = loadKeyboardSyncBinding();

export interface KeyBatchEvent {
	keyCode: number;
	isDown: boolean;
}

export class KeyboardSync {
	/**
	 * Check if a key is currently pressed - SYNCHRONOUS version for high-performance scenarios
	 * This is 100-1000x faster than the async version for rapid polling
	 */
	public static isKeyPressedSync(key: Key): boolean {
		const keyCode = stringToKeycode.get(key.toLowerCase());
		if (keyCode === undefined) {
			throwError(`Key ${key} is not supported.`);
		}
		return keyboardSyncBinding.isKeyPressedSync(keyCode);
	}

	/**
	 * Check multiple keys at once - more efficient than multiple isKeyPressedSync calls
	 * Returns an array of booleans in the same order as the input keys
	 */
	public static areKeysPressed(keys: Key[]): boolean[] {
		const keyCodes: number[] = [];
		for (const key of keys) {
			const keyCode = stringToKeycode.get(key.toLowerCase());
			if (keyCode === undefined) {
				throwError(`Key ${key} is not supported.`);
			}
			keyCodes.push(keyCode);
		}
		return keyboardSyncBinding.areKeysPressed(keyCodes);
	}

	/**
	 * Get all currently pressed keys
	 * Returns an array of key codes (not key names)
	 */
	public static getPressedKeys(): number[] {
		return keyboardSyncBinding.getPressedKeys();
	}

	/**
	 * Send multiple key events in a single batch - much more efficient than individual calls
	 * @param events - Array of key events to send
	 * @returns true if all events were sent successfully
	 */
	public static sendKeyBatch(events: { key: Key; isDown: boolean }[]): boolean {
		const batchEvents: KeyBatchEvent[] = [];

		for (const event of events) {
			const keyCode = stringToKeycode.get(event.key.toLowerCase());
			if (keyCode === undefined) {
				throwError(`Key ${event.key} is not supported.`);
			}
			batchEvents.push({ keyCode, isDown: event.isDown });
		}

		return keyboardSyncBinding.sendKeyBatch(batchEvents);
	}

	/**
	 * Optimized key tap sequence - combines hold and release in a single operation
	 */
	public static tapKeySync(key: Key): boolean {
		const keyCode = stringToKeycode.get(key.toLowerCase());
		if (keyCode === undefined) {
			throwError(`Key ${key} is not supported.`);
		}

		return keyboardSyncBinding.sendKeyBatch([
			{ keyCode, isDown: true },
			{ keyCode, isDown: false },
		]);
	}

	/**
	 * Create a high-performance key state monitor that uses minimal resources
	 * Returns a function to check key state without async overhead
	 */
	public static createKeyMonitor(key: Key): () => boolean {
		const keyCode = stringToKeycode.get(key.toLowerCase());
		if (keyCode === undefined) {
			throwError(`Key ${key} is not supported.`);
		}

		// Return a closure that checks the key state
		return () => keyboardSyncBinding.isKeyPressedSync(keyCode);
	}

	/**
	 * Create a multi-key state monitor for efficient combo detection
	 */
	public static createMultiKeyMonitor(keys: Key[]): () => boolean[] {
		const keyCodes: number[] = [];
		for (const key of keys) {
			const keyCode = stringToKeycode.get(key.toLowerCase());
			if (keyCode === undefined) {
				throwError(`Key ${key} is not supported.`);
			}
			keyCodes.push(keyCode);
		}

		// Return a closure that checks all key states
		return () => keyboardSyncBinding.areKeysPressed(keyCodes);
	}
}
