import { bindingFunctionNames, type ClipboardBinding, type KeyboardBinding, loadBinding } from '../src/utils/bindingLoader';

describe('bindingFunctionNames', () => {
	test('defines the screen binding surface', () => {
		expect(bindingFunctionNames.screen).toEqual(['getWindowPixels', 'getScreenPixels']);
	});

	test('defines the keyboard binding surface', () => {
		expect(bindingFunctionNames.keyboard).toEqual(['holdKey', 'releaseKey', 'holdKeys', 'releaseKeys', 'isKeyPressed', 'type', 'tapKey', 'holdKeyForDuration', 'stopAllHoldKeys']);
	});

	test('defines all native binding groups', () => {
		expect(Object.keys(bindingFunctionNames).sort()).toEqual(['clipboard', 'keyboard', 'keyboardHooks', 'keyboardSync', 'misc', 'mouse', 'panicShutdown', 'screen', 'screenRaw'].sort());
	});

	test('keeps PascalCase clipboard exports for compatibility', () => {
		expect(bindingFunctionNames.clipboard).toEqual(['ReadClipboard', 'WriteClipboard', 'ClipboardPaste']);
	});
});

describe('loadBinding proxy behavior', () => {
	test('creates lazy binding functions without loading native addon at import time', () => {
		const keyboard = loadBinding<KeyboardBinding>('keyboard');

		expect(typeof keyboard.holdKey).toBe('function');
		expect(typeof keyboard.releaseKey).toBe('function');
		expect(Object.keys(keyboard)).toEqual([...bindingFunctionNames.keyboard]);
	});

	test('creates independent proxies for different binding groups', () => {
		const keyboard = loadBinding<KeyboardBinding>('keyboard');
		const clipboard = loadBinding<ClipboardBinding>('clipboard');

		expect(typeof keyboard.tapKey).toBe('function');
		expect(typeof clipboard.ReadClipboard).toBe('function');
		expect('tapKey' in clipboard).toBe(false);
	});
});
