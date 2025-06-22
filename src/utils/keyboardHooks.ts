import { type KeyboardHooksBinding, keyboardHooksSchema, loadBinding } from './bindingLoader';

// Load binding
const keyboardHooksBinding = loadBinding<KeyboardHooksBinding>('keyboardHooks', keyboardHooksSchema);

export interface NativeKeyEvent {
	keyCode: number;
	timestamp: number;
}

export interface KeyListenerOptions {
	/**
	 * If true, the callback will only fire once per key press
	 * (requires the key to be released before firing again)
	 * @default true
	 */
	triggerOnce?: boolean;
}

export type KeyCallback = (event: NativeKeyEvent) => void;

/**
 * Register a native keyboard listener using Windows hooks.
 * This is much more efficient than polling.
 *
 * @param keyCodes Array of key codes to listen for (empty array = all keys)
 * @param callback Function to call when a key is pressed
 * @param options Listener options
 * @returns Cleanup function to unregister the listener
 */
export function registerKeyListener(keyCodes: number[], callback: KeyCallback, options: KeyListenerOptions = {}): () => void {
	const { triggerOnce = true } = options;

	// Call the native function which returns an unregister function
	return keyboardHooksBinding.registerKeyListener(keyCodes, callback, { triggerOnce });
}

/**
 * Stop all keyboard hooks and clean up resources
 */
export function stopAllKeyboardHooks(): void {
	keyboardHooksBinding.stopAllKeyboardHooks();
}
