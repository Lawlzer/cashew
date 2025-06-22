import { throwError } from '@lawlzer/utils';

import { type KeyboardBinding, keyboardSchema, loadBinding } from './bindingLoader';
import { Config } from './config';
import { type NativeKeyEvent, registerKeyListener, stopAllKeyboardHooks as stopAllHooks } from './keyboardHooks';

// Load binding
const keyboardBinding = loadBinding<KeyboardBinding>('keyboard', keyboardSchema);

// Types for keyboard events
export interface KeyPressEvent {
	key: Key;
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

// Track key states to detect press/release transitions (kept for compatibility)
const keyStates = new Map<string, boolean>();

// Active listeners - now stores unregister functions
const activeListeners = new Map<string, { abort: () => void }>();

const _keyAddonMap = {
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
export type Key = keyof typeof _keyAddonMap;

export enum KeyModifier {
	None = 0,
	// eslint-disable-next-line @typescript-eslint/prefer-literal-enum-member
	Alt = 1 << 0,
	// eslint-disable-next-line @typescript-eslint/prefer-literal-enum-member
	Ctrl = 1 << 1,
	// eslint-disable-next-line @typescript-eslint/prefer-literal-enum-member
	Shift = 1 << 2,
	// eslint-disable-next-line @typescript-eslint/prefer-literal-enum-member
	Win = 1 << 3,
}

export const stringToKeycode = new Map<string, number>([
	['backspace', 0x08],
	['tab', 0x09],
	['enter', 0x0d],
	['shift', 0x10],
	['ctrl', 0x11],
	['control', 0x11],
	['alt', 0x12],
	['pause', 0x13],
	['caps_lock', 0x14],
	['escape', 0x1b],
	['space', 0x20],
	['pageup', 0x21],
	['pagedown', 0x22],
	['end', 0x23],
	['home', 0x24],
	['left', 0x25],
	['leftarrow', 0x25],
	['up', 0x26],
	['uparrow', 0x26],
	['right', 0x27],
	['rightarrow', 0x27],
	['down', 0x28],
	['downarrow', 0x28],
	['insert', 0x2d],
	['delete', 0x2e],
	['0', 0x30],
	['1', 0x31],
	['2', 0x32],
	['3', 0x33],
	['4', 0x34],
	['5', 0x35],
	['6', 0x36],
	['7', 0x37],
	['8', 0x38],
	['9', 0x39],
	['a', 0x41],
	['b', 0x42],
	['c', 0x43],
	['d', 0x44],
	['e', 0x45],
	['f', 0x46],
	['g', 0x47],
	['h', 0x48],
	['i', 0x49],
	['j', 0x4a],
	['k', 0x4b],
	['l', 0x4c],
	['m', 0x4d],
	['n', 0x4e],
	['o', 0x4f],
	['p', 0x50],
	['q', 0x51],
	['r', 0x52],
	['s', 0x53],
	['t', 0x54],
	['u', 0x55],
	['v', 0x56],
	['w', 0x57],
	['x', 0x58],
	['y', 0x59],
	['z', 0x5a],
	['leftwindowskey', 0x5b],
	['numpad0', 0x60],
	['numpad1', 0x61],
	['numpad2', 0x62],
	['numpad3', 0x63],
	['numpad4', 0x64],
	['numpad5', 0x65],
	['numpad6', 0x66],
	['numpad7', 0x67],
	['numpad8', 0x68],
	['numpad9', 0x69],
	['multiply', 0x6a],
	['add', 0x6b],
	['separator', 0x6c],
	['subtract', 0x6d],
	['decimal', 0x6e],
	['divide', 0x6f],
	['f1', 0x70],
	['f2', 0x71],
	['f3', 0x72],
	['f4', 0x73],
	['f5', 0x74],
	['f6', 0x75],
	['f7', 0x76],
	['f8', 0x77],
	['f9', 0x78],
	['f10', 0x79],
	['f11', 0x7a],
	['f12', 0x7b],
	['f13', 0x7c],
	['f14', 0x7d],
	['f15', 0x7e],
	['f16', 0x7f],
	['f17', 0x80],
	['f18', 0x81],
	['f19', 0x82],
	['f20', 0x83],
	['f21', 0x84],
	['f22', 0x85],
	['f23', 0x86],
	['f24', 0x87],
	['leftshift', 0xa0],
	['rightshift', 0xa1],
	['leftcontrol', 0xa2],
	['rightcontrol', 0xa3],
	['leftalt', 0xa4],
	['rightalt', 0xa5],
	['volumemute', 0xad],
	['volumedown', 0xae],
	['volumeup', 0xaf],
	['`', 0xc0],
	['-', 0xbd],
	['minus', 0xbd],
	['dash', 0xbd],
	['=', 0xbb],
	['plus', 0xbb],
	[';', 0xba],
	['semicolon', 0xba],
	['maybesemicolon', 0xba],
	["'", 0xde],
	[',', 0xbc],
	['comma', 0xbc],
	['.', 0xbe],
	['period', 0xbe],
	['/', 0xbf],
	['\\', 0xdc],
	['[', 0xdb],
	[']', 0xdd],
]);

export class Keyboard {
	/**
	 * Holds a key using the SendInput API with scan codes, which may work better with games
	 * and other applications where standard input methods are inconsistent.
	 */
	public static async holdKey(inputKey: Key, windowTitle?: string): Promise<void> {
		const keyCode = stringToKeycode.get(inputKey.toLowerCase());

		if (keyCode === undefined) {
			throwError(`Key ${inputKey} is not supported.`);
		}

		const realWindowTitle = windowTitle ?? Config.windowTitle ?? '';
		await keyboardBinding.holdKey(keyCode, realWindowTitle);
	}

	/**
	 * Releases a key using the SendInput API with scan codes.
	 * WARNING: Often requires the target window to be in the foreground.
	 */
	public static async releaseKey(inputKey: Key, windowTitle?: string): Promise<void> {
		const keyCode = stringToKeycode.get(inputKey.toLowerCase());
		if (keyCode === undefined) {
			throwError(`Key ${inputKey} is not supported.`);
		}

		const realWindowTitle = windowTitle ?? Config.windowTitle ?? '';
		await keyboardBinding.releaseKey(keyCode, realWindowTitle);
	}

	/**
	 * Taps a key (press and release).
	 */
	public static async tapKey(inputKey: Key, windowTitle?: string): Promise<void> {
		const keyCode = stringToKeycode.get(inputKey.toLowerCase());
		if (keyCode === undefined) {
			throwError(`Key ${inputKey} is not supported.`);
		}

		const realWindowTitle = windowTitle ?? Config.windowTitle ?? '';
		await keyboardBinding.tapKey(keyCode, realWindowTitle);
	}

	/**
	 * Holds a key for a specified duration using the scan code method.
	 */
	public static async holdKeyFor(inputKey: Key, holdFor: number, _windowTitle?: string): Promise<void> {
		const keyCode = stringToKeycode.get(inputKey.toLowerCase());
		if (keyCode === undefined) {
			throwError(`Key ${inputKey} is not supported.`);
		}

		await keyboardBinding.holdKeyForDuration(keyCode, holdFor);
	}

	public static async isKeyPressed(key: Key): Promise<boolean> {
		const keyCode = stringToKeycode.get(key.toLowerCase());
		if (keyCode === undefined) throwError(`Key ${key} is not supported.`);

		return keyboardBinding.isKeyPressed(keyCode);
	}

	public static async waitForKeyPress(key: Key, msDelayPerCheck = 10): Promise<void> {
		while (!(await this.isKeyPressed(key))) {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, msDelayPerCheck);
			});
		}
	}

	/**
	 * Will not work for anything more than alphanumeric (a-z, 0-9) characters.
	 */
	public static async type(text: string, options?: { windowTitle?: string; delayPerKey?: number }): Promise<void> {
		const keycodesArray: number[] = [];
		for (const char of text) {
			keycodesArray.push(char.charCodeAt(0));
		}

		const windowTitle = options?.windowTitle ?? Config.windowTitle ?? '';
		await keyboardBinding.type(keycodesArray, windowTitle, options?.delayPerKey ?? 1);
	}

	/**
	 * Listen for a specific key press and execute a callback when it occurs.
	 * Now uses native Windows hooks for better performance.
	 * Returns a cleanup function to stop listening.
	 */
	public static onKeypress(key: Key, callback: (event: KeyPressEvent) => void, options: KeyListenerOptions = {}): () => void {
		const { triggerOnce = true } = options;

		const keyCode = stringToKeycode.get(key.toLowerCase());
		if (keyCode === undefined) {
			throw new Error(`Key ${key} is not supported.`);
		}

		// Create unique ID for this listener
		const listenerId = `${key}-${Date.now()}-${Math.random()}`;

		// Wrap the native callback to match our interface
		const nativeCallback = (event: NativeKeyEvent) => {
			const keyPressEvent: KeyPressEvent = {
				key,
				keyCode: event.keyCode,
				timestamp: event.timestamp,
			};

			try {
				callback(keyPressEvent);
			} catch (error) {
				console.error('Error in keypress callback:', error);
			}
		};

		// Register the native listener
		const unregister = registerKeyListener([keyCode], nativeCallback, { triggerOnce });

		// Store the unregister function
		activeListeners.set(listenerId, { abort: unregister } as any);

		// Return cleanup function
		return () => {
			unregister();
			activeListeners.delete(listenerId);
		};
	}

	/**
	 * Listen for all key presses and execute a callback for each.
	 * Now uses native Windows hooks for better performance.
	 * Returns a cleanup function to stop listening.
	 */
	public static getAllKeypresses(callback: (event: KeyPressEvent) => void, options: KeyListenerOptions = {}): () => void {
		const { triggerOnce = true } = options;

		// Create abort controller for this listener group
		const groupId = `all-keys-${Date.now()}`;

		// Wrap the native callback to match our interface
		const nativeCallback = (event: NativeKeyEvent) => {
			// Find the key name from the keycode
			let keyName: Key | undefined;
			for (const [key, code] of stringToKeycode.entries()) {
				if (code === event.keyCode) {
					keyName = key as Key;
					break;
				}
			}

			if (keyName) {
				const keyPressEvent: KeyPressEvent = {
					key: keyName,
					keyCode: event.keyCode,
					timestamp: event.timestamp,
				};

				try {
					callback(keyPressEvent);
				} catch (error) {
					console.error('Error in keypress callback:', error);
				}
			}
		};

		// Register the native listener for all keys (empty array)
		const unregister = registerKeyListener([], nativeCallback, { triggerOnce });

		// Store the unregister function
		activeListeners.set(groupId, { abort: unregister } as any);

		// Return cleanup function
		return () => {
			unregister();
			activeListeners.delete(groupId);
		};
	}

	/**
	 * Stop all active keyboard listeners
	 */
	public static stopAllKeyboardListeners(): void {
		// Stop all native hooks
		stopAllHooks();

		// Clear our tracking map
		activeListeners.clear();
		keyStates.clear();
	}
}

// todo make alll of this work for windowTitle
