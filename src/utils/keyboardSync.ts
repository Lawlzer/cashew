import { throwError } from '@lawlzer/utils';

import { type KeyboardSyncBinding, loadBinding } from './bindingLoader';
import { type Key, stringToKeycode } from './keyboard';

// Load the synchronous binding using the shared loader infrastructure
const keyboardSyncBinding = loadBinding<KeyboardSyncBinding>('keyboardSync');

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
