import { throwError } from '@lawlzer/utils';
import * as path from 'path';
import * as v from 'valibot';

// Helper function to require modules dynamically
function dynamicRequire(moduleId: string): any {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require(moduleId);
}

// Optimized directory resolution with caching
const cachedPackageRoot = (() => {
	let cached: string | null = null;

	return (): string => {
		if (cached !== null) return cached;

		// Strategy 1: Direct resolution for installed packages
		try {
			const resolved = require.resolve('@lawlzer/cashew/package.json');
			cached = path.dirname(resolved);
			return cached;
		} catch {
			// Continue to fallback strategies
		}

		// Strategy 2: Search from current working directory
		const searchPaths = [process.cwd(), path.dirname(process.argv[1] || process.cwd()), ...Array.from({ length: 5 }, (_, i) => path.join(process.cwd(), ...Array(i).fill('..'), 'node_modules', '@lawlzer', 'cashew'))];

		try {
			const fs = dynamicRequire('fs');
			for (const searchPath of searchPaths) {
				// Check for package.json to confirm it's our package
				if (fs.existsSync(path.join(searchPath, 'package.json'))) {
					// Verify it has our expected structure
					const releaseDir = path.join(searchPath, 'dist', 'build', 'Release');
					const fallbackDir = path.join(searchPath, 'build', 'Release');

					if (fs.existsSync(releaseDir) || fs.existsSync(fallbackDir)) {
						cached = searchPath;
						return cached;
					}
				}
			}
		} catch {
			// fs not available, use cwd as fallback
		}

		cached = process.cwd();
		return cached;
	};
})();

// Create require function for both ESM and CJS with better Bun support
function createRequireFunction(): NodeRequire {
	// Bun-specific handling
	if (typeof Bun !== 'undefined') {
		if (typeof require !== 'undefined') {
			return require;
		}

		// Create a Bun-compatible loader
		const bunLoader = ((id: string) => {
			if (id.endsWith('.node')) {
				const mod = { exports: {} };
				process.dlopen(mod, id);
				return mod.exports;
			}
			throw new Error(`Cannot require ${id} in Bun without require`);
		}) as any;

		bunLoader.resolve = (id: string) => id;
		return bunLoader as NodeRequire;
	}

	// Standard Node.js require
	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const getRequire = new Function('return typeof require !== "undefined" ? require : null;');
		const req = getRequire() as NodeRequire | null;
		if (req) return req;
	} catch {
		// Fall through
	}

	// Fallback loader using process.dlopen
	const fallbackLoader = ((id: string) => {
		if (id.endsWith('.node') && process.dlopen !== undefined) {
			const mod = { exports: {} };
			process.dlopen(mod, id);
			return mod.exports;
		}
		throw new Error(`Cannot load module ${id} - require not available`);
	}) as any;

	fallbackLoader.resolve = (id: string) => {
		throw new Error(`Cannot resolve ${id} - require not available`);
	};

	return fallbackLoader as NodeRequire;
}

const requireFunction = createRequireFunction();

// Optimized native binding loader
function loadNativeBinding(name: string): unknown {
	const bindingName = `${name}.node`;
	const packageRoot = cachedPackageRoot();

	// Build prioritized path list
	const paths = [
		// Direct attempts
		name,
		bindingName,

		// Package-relative paths (prioritize dist/build/Release for installed packages)
		path.join(packageRoot, 'dist', 'build', 'Release', bindingName),
		path.join(packageRoot, 'build', 'Release', bindingName),

		// CWD-relative paths
		path.join(process.cwd(), 'dist', 'build', 'Release', bindingName),
		path.join(process.cwd(), 'build', 'Release', bindingName),

		// Node modules paths (for when package is a dependency)
		...Array.from({ length: 3 }, (_, i) => [path.join(process.cwd(), ...Array(i).fill('..'), 'node_modules', '@lawlzer', 'cashew', 'dist', 'build', 'Release', bindingName), path.join(process.cwd(), ...Array(i).fill('..'), 'node_modules', '@lawlzer', 'cashew', 'build', 'Release', bindingName)]).flat(),
	];

	// Bun-specific optimizations
	if (typeof Bun !== 'undefined') {
		try {
			const fs = dynamicRequire('fs');
			// Try direct dlopen for existing files in Bun
			for (const bindingPath of paths) {
				if (fs.existsSync(bindingPath)) {
					try {
						const mod = { exports: {} };
						process.dlopen(mod, bindingPath);
						return mod.exports;
					} catch (err) {
						console.warn(`Failed to dlopen ${bindingPath}:`, err);
					}
				}
			}
		} catch {
			// fs not available
		}
	}

	// Standard require attempts
	const errors: string[] = [];
	for (const bindingPath of [...new Set(paths)]) {
		try {
			return requireFunction(bindingPath);
		} catch (err) {
			if (err instanceof Error && !err.message.includes('Cannot find module')) {
				errors.push(`${bindingPath}: ${err.message}`);
			}
		}
	}

	// Provide helpful error message
	throwError(`Could not load ${name} binding.\n` + `Searched paths:\n${[...new Set(paths)].map((p) => `  - ${p}`).join('\n')}\n\n` + `Errors:\n${errors.length > 0 ? errors.join('\n') : 'No specific errors captured'}\n\n` + `Make sure the native bindings are built (npm run build:cpp) and the package is properly installed.`);
}

// Define schemas using Valibot - using any for now to simplify
const functionSchema = v.any();

export const screenSchema = v.object({
	getWindowPixels: functionSchema,
	getScreenPixels: functionSchema,
});

export const keyboardSchema = v.object({
	holdKey: functionSchema,
	releaseKey: functionSchema,
	holdKeys: functionSchema,
	releaseKeys: functionSchema,
	isKeyPressed: functionSchema,
	type: functionSchema,
	tapKey: functionSchema,
	holdKeyForDuration: functionSchema,
	stopAllHoldKeys: functionSchema,
});

export const mouseSchema = v.object({
	click: functionSchema,
	clickMessage: functionSchema,
	getPosition: functionSchema,
	hold: functionSchema,
	release: functionSchema,
	moveRelative: functionSchema,
	moveRelativePolar: functionSchema,
	setPosition: functionSchema,
});

export const miscSchema = v.object({
	SetForegroundWindow: functionSchema,
	GetForegroundWindowTitle: functionSchema,
});

export const clipboardSchema = v.object({
	ReadClipboard: functionSchema,
	WriteClipboard: functionSchema,
	ClipboardPaste: functionSchema,
});

export const screenRawSchema = v.object({
	setSquare: functionSchema,
	clearSquare: functionSchema,
});

export const panicShutdownSchema = v.object({
	enablePanicShutdown: functionSchema,
});

export const keyboardHooksSchema = v.object({
	registerKeyListener: functionSchema,
	stopAllKeyboardHooks: functionSchema,
});

export const keyboardSyncSchema = v.object({
	isKeyPressedSync: functionSchema,
	areKeysPressed: functionSchema,
	getPressedKeys: functionSchema,
	sendKeyBatch: functionSchema,
	getRawKeyState: functionSchema,
	isKeyPressedAlt: functionSchema,
});

// Create a typed binding loader that validates at runtime
export function loadBinding<T>(bindingName: string, schema: v.GenericSchema<T>): T {
	const rawBinding = loadNativeBinding(bindingName);

	// Validate the binding structure
	const result = v.safeParse(schema, rawBinding);

	if (!result.success) {
		const issues = result.issues.map((issue) => issue.message).join(', ');
		throwError(`${bindingName} binding validation failed: ${issues}`);
	}

	// Create proxy to add error handling to each function
	const binding = result.output as any;
	const proxiedBinding: any = {};

	// List of functions that should NOT be wrapped as async
	// These functions return synchronous values like cleanup functions
	const syncFunctions = ['registerKeyListener', 'stopAllHoldKeys', 'isKeyPressedSync', 'areKeysPressed', 'getPressedKeys', 'sendKeyBatch', 'getRawKeyState', 'isKeyPressedAlt'];

	for (const [key, value] of Object.entries(binding)) {
		if (typeof value === 'function') {
			if (syncFunctions.includes(key)) {
				// Keep synchronous functions as-is, just add error handling
				proxiedBinding[key] = (...args: any[]): any => {
					try {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						return value(...args);
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						throwError(`${bindingName}.${key} failed: ${message}`);
					}
				};
			} else {
				// Wrap other functions as async
				proxiedBinding[key] = async (...args: any[]): Promise<any> => {
					try {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						return await value(...args);
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						throwError(`${bindingName}.${key} failed: ${message}`);
					}
				};
			}
		} else {
			proxiedBinding[key] = value;
		}
	}

	return proxiedBinding as T;
}

// Export type utilities - define the types manually
export interface ScreenBinding {
	getWindowPixels: (windowTitle: string, x: number, y: number, width: number, height: number) => Promise<Buffer>;
	getScreenPixels: (x: number, y: number, width: number, height: number) => Promise<Buffer>;
}

export interface KeyboardBinding {
	holdKey: (keyCode: number, windowTitle?: string) => Promise<void>;
	releaseKey: (keyCode: number, windowTitle?: string) => Promise<void>;
	holdKeys: (keyCodes: number[], windowTitle?: string) => Promise<void>;
	releaseKeys: (keyCodes: number[]) => Promise<void>;
	isKeyPressed: (keyCode: number) => Promise<boolean>;
	type: (keycodes: number[], windowTitle: string, delayPerKey: number) => Promise<boolean>;
	tapKey: (keyCode: number, windowTitle?: string) => Promise<void>;
	holdKeyForDuration: (keyCode: number, duration: number) => Promise<void>;
	stopAllHoldKeys: () => void;
}

export interface MouseBinding {
	click: (x: number | null, y: number | null, button: string, holdFor: number, windowTitle?: string) => Promise<void>;
	clickMessage: (x: number, y: number, holdFor: number, windowTitle: string, messageType: string) => Promise<void>;
	getPosition: () => Promise<{ x: number; y: number }>;
	hold: (x: number | null, y: number | null, button: string) => Promise<void>;
	release: (x: number | null, y: number | null, button: string) => Promise<void>;
	moveRelative: (dx: number, dy: number, smoothDuration: number, useRawInput: boolean) => Promise<void>;
	moveRelativePolar: (angle: number, distance: number, smoothDuration: number, useRawInput: boolean) => Promise<void>;
	setPosition: (x: number, y: number, smoothDuration: number, windowTitle?: string) => Promise<void>;
}

export interface MiscBinding {
	SetForegroundWindow: (windowTitle: string) => Promise<boolean>;
	GetForegroundWindowTitle: () => Promise<string | null>;
}

export interface ClipboardBinding {
	ReadClipboard: () => Promise<string | null>;
	WriteClipboard: (text: string) => Promise<boolean>;
	ClipboardPaste: () => Promise<boolean>;
}

export interface ScreenRawBinding {
	setSquare: (x: number, y: number, width: number, height: number, r: number, g: number, b: number) => Promise<boolean>;
	clearSquare: () => Promise<boolean>;
}

export interface PanicShutdownBinding {
	enablePanicShutdown: (keyCode: number, keyName: string) => Promise<boolean>;
}

export interface KeyboardHooksBinding {
	registerKeyListener: (keyCodes: number[], callback: (event: { keyCode: number; timestamp: number }) => void, options: { triggerOnce: boolean }) => () => void;
	stopAllKeyboardHooks: () => void;
}

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
