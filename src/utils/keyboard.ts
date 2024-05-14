import { sleep, throwError } from '@lawlzer/utils';
import bindings from 'bindings';
const keyboardAddon = bindings('keyboard');

export const keyAddonMap = {
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
	A: 65,
	B: 66,
	C: 67,
	D: 68,
	E: 69,
	F: 70,
	G: 71,
	H: 72,
	I: 73,
	J: 74,
	K: 75,
	L: 76,
	M: 77,
	N: 78,
	O: 79,
	P: 80,
	Q: 81,
	R: 82,
	S: 83,
	T: 84,
	U: 85,
	V: 86,
	W: 87,
	X: 88,
	Y: 89,
	Z: 90,
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
	tab: 9,
	clear: 12,
	return: 13,
	shift: 16,
	control: 17,
	menu: 18,
	pause: 19,
	escape: 27,
	space: 32,
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
} as const;
export type Key = keyof typeof keyAddonMap;

function keyToKeyCode(key: Key) {
	return keyAddonMap[key] ?? throwError('key not found: ', key);
}

export class Keyboard {
	public static async holdKey(inputKey: Key) {
		await keyboardAddon.holdKey(keyToKeyCode(inputKey));
	}

	public static async releaseKey(inputKey: Key) {
		await keyboardAddon.releaseKey(keyToKeyCode(inputKey));
	}

	public static async tapKey(inputKey: Key) {
		await this.holdKey(inputKey);
		await this.releaseKey(inputKey);
	}

	public static async holdKeyFor(inputKey: Key, holdFor: number) {
		await this.holdKey(inputKey);
		await sleep(holdFor);
		await this.releaseKey(inputKey);
	}


	public static async isKeyPressed(key: Key): Promise<boolean> {
		const result = keyboardAddon.isKeyPressed(keyToKeyCode(key));
		if (typeof result !== 'boolean') throwError('result was not a boolean: ', result);
		return result;
	}

	public static async waitForKeyPress(key: Key, msDelayPerCheck = 10) {
		while (!(await this.isKeyPressed(key))) {
			await sleep(msDelayPerCheck);
		}
	}

	public static async type(text: string, options?: { windowTitle?: string; delay?: number }) {
		const windowTitle = options?.windowTitle ?? ''; 

		await keyboardAddon.Type(text, windowTitle, options?.delay ?? 1);
	}
}
