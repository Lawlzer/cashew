import * as v from 'valibot';

import { clipboardSchema, keyboardHooksSchema, keyboardSchema, keyboardSyncSchema, miscSchema, mouseSchema, panicShutdownSchema, screenRawSchema, screenSchema } from '../src/utils/bindingLoader';

describe('Binding schemas', () => {
	describe('screenSchema', () => {
		test('validates object with required functions', () => {
			const valid = {
				getWindowPixels: () => {},
				getScreenPixels: () => {},
			};
			const result = v.safeParse(screenSchema, valid);
			expect(result.success).toBe(true);
		});

		test('rejects object missing required functions', () => {
			const invalid = { getWindowPixels: () => {} };
			const result = v.safeParse(screenSchema, invalid);
			expect(result.success).toBe(false);
		});
	});

	describe('keyboardSchema', () => {
		test('validates complete keyboard binding', () => {
			const valid = {
				holdKey: () => {},
				releaseKey: () => {},
				holdKeys: () => {},
				releaseKeys: () => {},
				isKeyPressed: () => {},
				type: () => {},
				tapKey: () => {},
				holdKeyForDuration: () => {},
				stopAllHoldKeys: () => {},
			};
			const result = v.safeParse(keyboardSchema, valid);
			expect(result.success).toBe(true);
		});

		test('rejects incomplete keyboard binding', () => {
			const invalid = { holdKey: () => {}, releaseKey: () => {} };
			const result = v.safeParse(keyboardSchema, invalid);
			expect(result.success).toBe(false);
		});
	});

	describe('mouseSchema', () => {
		test('validates complete mouse binding', () => {
			const valid = {
				click: () => {},
				clickMessage: () => {},
				getPosition: () => {},
				hold: () => {},
				release: () => {},
				moveRelative: () => {},
				moveRelativePolar: () => {},
				setPosition: () => {},
			};
			const result = v.safeParse(mouseSchema, valid);
			expect(result.success).toBe(true);
		});
	});

	describe('miscSchema', () => {
		test('validates complete misc binding', () => {
			const valid = {
				SetForegroundWindow: () => {},
				GetForegroundWindowTitle: () => {},
			};
			const result = v.safeParse(miscSchema, valid);
			expect(result.success).toBe(true);
		});
	});

	describe('clipboardSchema', () => {
		test('validates complete clipboard binding', () => {
			const valid = {
				ReadClipboard: () => {},
				WriteClipboard: () => {},
				ClipboardPaste: () => {},
			};
			const result = v.safeParse(clipboardSchema, valid);
			expect(result.success).toBe(true);
		});
	});

	describe('screenRawSchema', () => {
		test('validates complete screenRaw binding', () => {
			const valid = {
				setSquare: () => {},
				clearSquare: () => {},
			};
			const result = v.safeParse(screenRawSchema, valid);
			expect(result.success).toBe(true);
		});
	});

	describe('panicShutdownSchema', () => {
		test('validates complete panicShutdown binding', () => {
			const valid = { enablePanicShutdown: () => {} };
			const result = v.safeParse(panicShutdownSchema, valid);
			expect(result.success).toBe(true);
		});
	});

	describe('keyboardHooksSchema', () => {
		test('validates complete keyboardHooks binding', () => {
			const valid = {
				registerKeyListener: () => {},
				stopAllKeyboardHooks: () => {},
			};
			const result = v.safeParse(keyboardHooksSchema, valid);
			expect(result.success).toBe(true);
		});
	});

	describe('keyboardSyncSchema', () => {
		test('validates complete keyboardSync binding', () => {
			const valid = {
				isKeyPressedSync: () => {},
				areKeysPressed: () => {},
				getPressedKeys: () => {},
				sendKeyBatch: () => {},
				getRawKeyState: () => {},
				isKeyPressedAlt: () => {},
			};
			const result = v.safeParse(keyboardSyncSchema, valid);
			expect(result.success).toBe(true);
		});

		test('rejects incomplete keyboardSync binding', () => {
			const invalid = { isKeyPressedSync: () => {} };
			const result = v.safeParse(keyboardSyncSchema, invalid);
			expect(result.success).toBe(false);
		});
	});
});

describe('loadBinding proxy behavior', () => {
	// We can't test loadBinding directly (it requires native modules),
	// but we can test the proxy wrapping logic by importing the schema
	// validation patterns

	test('all schemas are valid valibot object schemas', () => {
		const schemas = [screenSchema, keyboardSchema, mouseSchema, miscSchema, clipboardSchema, screenRawSchema, panicShutdownSchema, keyboardHooksSchema, keyboardSyncSchema];

		for (const schema of schemas) {
			// Each schema should successfully validate a matching object
			expect(schema).toBeDefined();
			// Verify it's a valibot schema by checking it works with safeParse
			const emptyResult = v.safeParse(schema, {});
			expect(emptyResult.success).toBe(false); // Empty object should fail
		}
	});
});
