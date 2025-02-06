import { sleep, throwError } from '@lawlzer/utils';
import bindings from 'bindings';

import { Config } from './config';
const keyboardAddon = bindings('keyboard');

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
	 * WARNING: Seems to be relatively inconsistent in background windows.
	 */
	public static async holdKey(inputKey: Key, windowTitle?: string): Promise<void> {
		const windowTitleFinal = windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		await keyboardAddon.holdKey(keyToKeyCode(inputKey), windowTitleFinal);
	}

	/**
	 * WARNING: Requires it to be the Foreground window. Does not seem to be possible to release keys in background windows.
	 */
	public static async releaseKeyDesktop(inputKey: Key, windowTitle?: string): Promise<void> {
		const windowTitleFinal = windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		await keyboardAddon.releaseKey(keyToKeyCode(inputKey), windowTitleFinal);
	}

	/**
	 * May be useful, because holdKey + releaseKey internally works differently than Type, so it *may* be useful.
	 */
	public static async tapKey(inputKey: Key, windowTitle?: string): Promise<void> {
		const windowTitleFinal = windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		await keyboardAddon.tapKey(keyToKeyCode(inputKey), windowTitleFinal);
	}

	/**
	 * WARNING: Does not seem to work in background windows?
	 */
	public static async holdKeyFor(inputKey: Key, holdFor: number): Promise<void> {
		await this.holdKey(inputKey);
		await sleep(holdFor);
		await this.releaseKeyDesktop(inputKey);
	}

	public static async isKeyPressed(key: Key): Promise<boolean> {
		const result = await keyboardAddon.isKeyPressed(keyToKeyCode(key));
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

		await keyboardAddon.type(keycodesArray, windowTitle, options?.delayPerKey ?? 1);
	}
}

// todo make alll of this work for windowTitle
