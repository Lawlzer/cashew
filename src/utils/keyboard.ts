import { sleep, throwError } from '@lawlzer/utils';
import { loadTypedBinding, type BindingSchema, createValidatedFunction } from './bindingLoader';

import { Config } from './config';

interface KeyboardBinding {
	holdKey: (keyCode: number, windowTitle: string) => Promise<void>;
	releaseKey: (keyCode: number, windowTitle: string) => Promise<void>;
	tapKey: (keyCode: number, windowTitle: string) => Promise<void>;
	isKeyPressed: (keyCode: number) => Promise<boolean>;
	type: (keycodesArray: number[], windowTitle: string, delayPerKey: number) => Promise<boolean>;
}

// Define the schema for the keyboard binding
const keyboardBindingSchema: BindingSchema = {
	holdKey: {
		type: 'function',
		params: [
			{ name: 'keyCode', type: 'number' },
			{ name: 'windowTitle', type: 'string' },
		],
		returnType: 'undefined',
	},
	releaseKey: {
		type: 'function',
		params: [
			{ name: 'keyCode', type: 'number' },
			{ name: 'windowTitle', type: 'string' },
		],
		returnType: 'undefined',
	},
	tapKey: {
		type: 'function',
		params: [
			{ name: 'keyCode', type: 'number' },
			{ name: 'windowTitle', type: 'string' },
		],
		returnType: 'undefined',
	},
	isKeyPressed: {
		type: 'function',
		params: [{ name: 'keyCode', type: 'number' }],
		returnType: 'boolean',
	},
	type: {
		type: 'function',
		params: [
			{ name: 'keycodesArray', type: 'object' },
			{ name: 'windowTitle', type: 'string' },
			{ name: 'delayPerKey', type: 'number' },
		],
		returnType: 'boolean',
	},
};

// Custom validator for KeyboardBinding
function isKeyboardBinding(binding: unknown): binding is KeyboardBinding {
	return typeof binding === 'object' && binding !== null && 'holdKey' in binding && 'releaseKey' in binding && 'tapKey' in binding && 'isKeyPressed' in binding && 'type' in binding && typeof (binding as any).holdKey === 'function' && typeof (binding as any).releaseKey === 'function' && typeof (binding as any).tapKey === 'function' && typeof (binding as any).isKeyPressed === 'function' && typeof (binding as any).type === 'function';
}

// Load the binding with proper typing and validation
const keyboardBinding = loadTypedBinding<KeyboardBinding>('keyboard', keyboardBindingSchema, isKeyboardBinding);

// Create validated wrapper functions with runtime type checking
const holdKeyValidated = createValidatedFunction(keyboardBinding.holdKey, 'holdKey', 'undefined');

const releaseKeyValidated = createValidatedFunction(keyboardBinding.releaseKey, 'releaseKey', 'undefined');

const tapKeyValidated = createValidatedFunction(keyboardBinding.tapKey, 'tapKey', 'undefined');

const isKeyPressedValidated = createValidatedFunction(keyboardBinding.isKeyPressed, 'isKeyPressed', 'boolean');

const typeValidated = createValidatedFunction(keyboardBinding.type, 'type', 'boolean');

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
export type Key = keyof typeof keyAddonMap;

function keyToKeyCode(key: Key) {
	return keyAddonMap[key] ?? throwError(`keycode not found for key: '${key}'`);
}

export class Keyboard {
	/**
	 * Holds a key using the SendInput API with scan codes, which may work better with games
	 * and other applications where standard input methods are inconsistent.
	 */
	public static async holdKey(inputKey: Key, windowTitle?: string): Promise<void> {
		const windowTitleFinal = windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		// Uses SendInput with a different approach than the standard holdKey
		const keyCode = keyToKeyCode(inputKey);
		await holdKeyValidated(keyCode, windowTitleFinal);
	}

	/**
	 * Releases a key using the SendInput API with scan codes.
	 * WARNING: Often requires the target window to be in the foreground.
	 */
	public static async releaseKey(inputKey: Key, windowTitle?: string): Promise<void> {
		const windowTitleFinal = windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		const keyCode = keyToKeyCode(inputKey);
		await releaseKeyValidated(keyCode, windowTitleFinal);
	}

	/**
	 * Taps a key (press and release).
	 */
	public static async tapKey(inputKey: Key, windowTitle?: string): Promise<void> {
		const windowTitleFinal = windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		const keyCode = keyToKeyCode(inputKey);
		await tapKeyValidated(keyCode, windowTitleFinal);
	}

	/**
	 * Holds a key for a specified duration using the scan code method.
	 */
	public static async holdKeyFor(inputKey: Key, holdFor: number, windowTitle?: string): Promise<void> {
		const windowTitleFinal = windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		await this.holdKey(inputKey, windowTitleFinal);
		await sleep(holdFor);
		await this.releaseKey(inputKey, windowTitleFinal);
	}

	public static async isKeyPressed(key: Key): Promise<boolean> {
		const result = await isKeyPressedValidated(keyToKeyCode(key));
		if (typeof result !== 'boolean') throwError('result was not a boolean: ', result);
		return result;
	}

	public static async waitForKeyPress(key: Key, msDelayPerCheck = 10): Promise<void> {
		while (!(await this.isKeyPressed(key))) {
			await sleep(msDelayPerCheck);
		}
	}

	/**
	 * Will not work for anything more than alphanumeric (a-z, 0-9) characters.
	 */
	public static async type(text: string, options?: { windowTitle?: string; delayPerKey?: number }): Promise<void> {
		const windowTitle = options?.windowTitle ?? Config.getProcessConfig().windowTitle ?? '';

		const keycodesArray = text.split('').map((char) => keyToKeyCode(char as Key));

		await typeValidated(keycodesArray, windowTitle, options?.delayPerKey ?? 1);
	}
}

// todo make alll of this work for windowTitle
