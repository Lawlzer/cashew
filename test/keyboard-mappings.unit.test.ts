import { _keyAddonMap, KeyModifier, stringToKeycode } from '../src/utils/keyboard';

describe('stringToKeycode', () => {
	test('contains all letter keys a-z', () => {
		for (let i = 0; i < 26; i++) {
			const letter = String.fromCharCode(97 + i); // 'a' to 'z'
			expect(stringToKeycode.has(letter)).toBe(true);
			// Virtual key codes for A-Z are 0x41-0x5A
			expect(stringToKeycode.get(letter)).toBe(0x41 + i);
		}
	});

	test('contains all number keys 0-9', () => {
		for (let i = 0; i <= 9; i++) {
			const num = String(i);
			expect(stringToKeycode.has(num)).toBe(true);
			// Virtual key codes for 0-9 are 0x30-0x39
			expect(stringToKeycode.get(num)).toBe(0x30 + i);
		}
	});

	test('contains function keys f1-f24', () => {
		for (let i = 1; i <= 24; i++) {
			const fKey = `f${i}`;
			expect(stringToKeycode.has(fKey)).toBe(true);
			// F1-F24 are 0x70-0x87
			expect(stringToKeycode.get(fKey)).toBe(0x70 + (i - 1));
		}
	});

	test('contains numpad keys 0-9', () => {
		for (let i = 0; i <= 9; i++) {
			const numpad = `numpad${i}`;
			expect(stringToKeycode.has(numpad)).toBe(true);
			expect(stringToKeycode.get(numpad)).toBe(0x60 + i);
		}
	});

	test('contains modifier keys', () => {
		expect(stringToKeycode.get('shift')).toBe(0x10);
		expect(stringToKeycode.get('control')).toBe(0x11);
		expect(stringToKeycode.get('ctrl')).toBe(0x11);
		expect(stringToKeycode.get('alt')).toBe(0x12);
		expect(stringToKeycode.get('leftshift')).toBe(0xa0);
		expect(stringToKeycode.get('rightshift')).toBe(0xa1);
		expect(stringToKeycode.get('leftcontrol')).toBe(0xa2);
		expect(stringToKeycode.get('rightcontrol')).toBe(0xa3);
		expect(stringToKeycode.get('leftalt')).toBe(0xa4);
		expect(stringToKeycode.get('rightalt')).toBe(0xa5);
	});

	test('contains navigation keys', () => {
		expect(stringToKeycode.get('left')).toBe(0x25);
		expect(stringToKeycode.get('up')).toBe(0x26);
		expect(stringToKeycode.get('right')).toBe(0x27);
		expect(stringToKeycode.get('down')).toBe(0x28);
		expect(stringToKeycode.get('pageup')).toBe(0x21);
		expect(stringToKeycode.get('pagedown')).toBe(0x22);
		expect(stringToKeycode.get('home')).toBe(0x24);
		expect(stringToKeycode.get('end')).toBe(0x23);
	});

	test('contains special keys', () => {
		expect(stringToKeycode.get('enter')).toBe(0x0d);
		expect(stringToKeycode.get('return')).toBe(0x0d);
		expect(stringToKeycode.get('tab')).toBe(0x09);
		expect(stringToKeycode.get('escape')).toBe(0x1b);
		expect(stringToKeycode.get('space')).toBe(0x20);
		expect(stringToKeycode.get('backspace')).toBe(0x08);
		expect(stringToKeycode.get('delete')).toBe(0x2e);
		expect(stringToKeycode.get('insert')).toBe(0x2d);
	});

	test('contains mouse button codes', () => {
		expect(stringToKeycode.get('leftclick')).toBe(0x01);
		expect(stringToKeycode.get('rightclick')).toBe(0x02);
		expect(stringToKeycode.get('middleclick')).toBe(0x04);
	});

	test('alias keys map to the same keycode', () => {
		// enter and return should both be 0x0d
		expect(stringToKeycode.get('enter')).toBe(stringToKeycode.get('return'));
		// ctrl and control should both be 0x11
		expect(stringToKeycode.get('ctrl')).toBe(stringToKeycode.get('control'));
		// left and leftarrow
		expect(stringToKeycode.get('left')).toBe(stringToKeycode.get('leftarrow'));
		// space and ' '
		expect(stringToKeycode.get('space')).toBe(stringToKeycode.get(' '));
		// tab and '\t'
		expect(stringToKeycode.get('tab')).toBe(stringToKeycode.get('\t'));
	});

	test('keys are normalized to lowercase', () => {
		// All keys in the map should be lowercase
		for (const key of stringToKeycode.keys()) {
			expect(key).toBe(key.toLowerCase());
		}
	});

	test('returns undefined for unknown keys', () => {
		expect(stringToKeycode.get('nonexistent')).toBeUndefined();
		expect(stringToKeycode.get('')).toBeUndefined();
	});

	test('contains special character keys', () => {
		expect(stringToKeycode.get('`')).toBe(0xc0);
		expect(stringToKeycode.get('-')).toBe(0xbd);
		expect(stringToKeycode.get('=')).toBe(0xbb);
		expect(stringToKeycode.get(';')).toBe(0xba);
		expect(stringToKeycode.get("'")).toBe(0xde);
		expect(stringToKeycode.get(',')).toBe(0xbc);
		expect(stringToKeycode.get('.')).toBe(0xbe);
		expect(stringToKeycode.get('/')).toBe(0xbf);
		expect(stringToKeycode.get('\\')).toBe(0xdc);
		expect(stringToKeycode.get('[')).toBe(0xdb);
		expect(stringToKeycode.get(']')).toBe(0xdd);
	});
});

describe('KeyModifier', () => {
	test('None is 0', () => {
		expect(KeyModifier.None).toBe(0);
	});

	test('individual modifiers are powers of 2', () => {
		expect(KeyModifier.Alt).toBe(1);
		expect(KeyModifier.Ctrl).toBe(2);
		expect(KeyModifier.Shift).toBe(4);
		expect(KeyModifier.Win).toBe(8);
	});

	test('modifiers can be combined with bitwise OR', () => {
		const ctrlShift = KeyModifier.Ctrl | KeyModifier.Shift;
		expect(ctrlShift).toBe(6);

		const ctrlAltShift = KeyModifier.Ctrl | KeyModifier.Alt | KeyModifier.Shift;
		expect(ctrlAltShift).toBe(7);

		const all = KeyModifier.Alt | KeyModifier.Ctrl | KeyModifier.Shift | KeyModifier.Win;
		expect(all).toBe(15);
	});

	test('individual modifiers can be checked with bitwise AND', () => {
		const ctrlShift = KeyModifier.Ctrl | KeyModifier.Shift;
		expect(ctrlShift & KeyModifier.Ctrl).toBeTruthy();
		expect(ctrlShift & KeyModifier.Shift).toBeTruthy();
		expect(ctrlShift & KeyModifier.Alt).toBeFalsy();
		expect(ctrlShift & KeyModifier.Win).toBeFalsy();
	});
});

describe('_keyAddonMap (deprecated, backward compatibility)', () => {
	test('is defined and contains expected keys', () => {
		expect(_keyAddonMap).toBeDefined();
		expect(_keyAddonMap.enter).toBe(0x0d);
		expect(_keyAddonMap.a).toBe(0x41);
		expect(_keyAddonMap.f1).toBe(0x70);
	});

	test('matches stringToKeycode entries', () => {
		for (const [key, value] of Object.entries(_keyAddonMap)) {
			const mapValue = stringToKeycode.get(key.toLowerCase());
			expect(mapValue).toBe(value);
		}
	});
});
