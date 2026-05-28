import { throwError } from '@lawlzer/utils';
import * as path from 'path';

type NativeFunction = (...args: unknown[]) => unknown;
type NativeAddon = Record<string, unknown>;

const cachedPackageRoot = (() => {
	let cached: string | null = null;

	return (): string => {
		if (cached !== null) return cached;

		try {
			const resolved = require.resolve('@lawlzer/cashew/package.json');
			cached = path.dirname(resolved);
			return cached;
		} catch {
			// Continue to local development fallbacks.
		}

		cached = process.cwd();
		return cached;
	};
})();

function createRequireFunction(): NodeRequire {
	if (typeof Bun !== 'undefined') {
		if (typeof require !== 'undefined') return require;

		const bunLoader = ((id: string) => {
			if (id.endsWith('.node')) {
				const mod = { exports: {} };
				process.dlopen(mod, id);
				return mod.exports;
			}
			throw new Error(`Cannot require ${id} in Bun without require`);
		}) as NodeRequire;

		const resolve = ((id: string) => id) as NodeRequire['resolve'];
		resolve.paths = () => [];
		bunLoader.resolve = resolve;
		return bunLoader;
	}

	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const getRequire = new Function('return typeof require !== "undefined" ? require : null;');
		const req = getRequire() as NodeRequire | null;
		if (req) return req;
	} catch {
		// Fall through to process.dlopen loader.
	}

	const fallbackLoader = ((id: string) => {
		if (id.endsWith('.node') && process.dlopen !== undefined) {
			const mod = { exports: {} };
			process.dlopen(mod, id);
			return mod.exports;
		}
		throw new Error(`Cannot load module ${id} - require not available`);
	}) as NodeRequire;

	const resolve = ((id: string) => {
		throw new Error(`Cannot resolve ${id} - require not available`);
	}) as unknown as NodeRequire['resolve'];
	resolve.paths = () => [];
	fallbackLoader.resolve = resolve;

	return fallbackLoader;
}

const requireFunction = createRequireFunction();

function currentPlatformTriples(): string[] {
	if (process.platform === 'win32') {
		if (process.arch === 'x64') return ['win32-x64-msvc'];
		if (process.arch === 'arm64') return ['win32-arm64-msvc'];
	}

	return [`${process.platform}-${process.arch}`];
}

function nativeFileNames(): string[] {
	return ['cashew.node', ...currentPlatformTriples().map((triple) => `cashew.${triple}.node`)];
}

function optionalNativePackages(): string[] {
	return currentPlatformTriples().map((triple) => `@lawlzer/cashew-${triple}`);
}

function candidateNativePaths(): string[] {
	const packageRoot = cachedPackageRoot();
	const roots = [packageRoot, process.cwd(), path.join(process.cwd(), 'node_modules', '@lawlzer', 'cashew')];
	const relativeDirs = ['', 'dist', path.join('build', 'Release'), path.join('dist', 'build', 'Release')];
	const paths: string[] = [];

	for (const fileName of nativeFileNames()) {
		paths.push(fileName);
		for (const root of roots) {
			for (const relativeDir of relativeDirs) {
				paths.push(path.join(root, relativeDir, fileName));
			}
		}
	}

	return [...new Set(paths)];
}

let cachedNativeAddon: NativeAddon | null = null;

function loadNativeAddon(): NativeAddon {
	if (cachedNativeAddon !== null) return cachedNativeAddon;

	const errors: string[] = [];

	for (const packageName of optionalNativePackages()) {
		try {
			cachedNativeAddon = requireFunction(packageName) as NativeAddon;
			return cachedNativeAddon;
		} catch (error) {
			if (error instanceof Error && !error.message.includes('Cannot find module')) {
				errors.push(`${packageName}: ${error.message}`);
			}
		}
	}

	for (const bindingPath of candidateNativePaths()) {
		try {
			cachedNativeAddon = requireFunction(bindingPath) as NativeAddon;
			return cachedNativeAddon;
		} catch (error) {
			if (error instanceof Error && !error.message.includes('Cannot find module')) {
				errors.push(`${bindingPath}: ${error.message}`);
			}
		}
	}

	throwError(
		`Could not load cashew native binding.\n` +
			`Searched packages:\n${optionalNativePackages()
				.map((p) => `  - ${p}`)
				.join('\n')}\n` +
			`Searched paths:\n${candidateNativePaths()
				.map((p) => `  - ${p}`)
				.join('\n')}\n\n` +
			`Errors:\n${errors.length > 0 ? errors.join('\n') : 'No specific errors captured'}\n\n` +
			`Make sure the Rust native binding is built (npm run build:native).`
	);
}

export const bindingFunctionNames = {
	screen: ['getWindowPixels', 'getScreenPixels'],
	keyboard: ['holdKey', 'releaseKey', 'holdKeys', 'releaseKeys', 'isKeyPressed', 'type', 'tapKey', 'holdKeyForDuration', 'stopAllHoldKeys'],
	mouse: ['click', 'clickMessage', 'getPosition', 'hold', 'release', 'moveRelative', 'moveRelativePolar', 'setPosition'],
	misc: ['SetForegroundWindow', 'GetForegroundWindowTitle'],
	clipboard: ['ReadClipboard', 'WriteClipboard', 'ClipboardPaste'],
	screenRaw: ['setSquare', 'clearSquare'],
	panicShutdown: ['enablePanicShutdown'],
	keyboardHooks: ['registerKeyListener', 'stopAllKeyboardHooks'],
	keyboardSync: ['isKeyPressedSync', 'areKeysPressed', 'getPressedKeys', 'sendKeyBatch', 'getRawKeyState', 'isKeyPressedAlt'],
} as const;

export type BindingName = keyof typeof bindingFunctionNames;

const syncFunctions = new Set<string>(['registerKeyListener', 'stopAllKeyboardHooks', 'stopAllHoldKeys', 'isKeyPressedSync', 'areKeysPressed', 'getPressedKeys', 'sendKeyBatch', 'getRawKeyState', 'isKeyPressedAlt']);

function getNativeFunction(functionName: string): NativeFunction {
	const value = loadNativeAddon()[functionName];
	if (typeof value !== 'function') {
		throwError(`cashew native binding is missing function: ${functionName}`);
	}
	return value as NativeFunction;
}

function callNative(bindingName: string, functionName: string, args: unknown[]): unknown {
	try {
		return getNativeFunction(functionName)(...args);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throwError(`${bindingName}.${functionName} failed: ${message}`);
	}
}

function createBindingFunction(bindingName: string, functionName: string): NativeFunction {
	if (bindingName === 'keyboardHooks' && functionName === 'registerKeyListener') {
		return (...args: unknown[]) => {
			const listenerId = callNative(bindingName, functionName, args);
			if (typeof listenerId !== 'number') {
				throwError(`keyboardHooks.registerKeyListener returned invalid listener id: ${String(listenerId)}`);
			}

			return (): void => {
				callNative(bindingName, 'unregisterKeyListener', [listenerId]);
			};
		};
	}

	if (syncFunctions.has(functionName)) {
		return (...args: unknown[]) => callNative(bindingName, functionName, args);
	}

	return async (...args: unknown[]) => {
		try {
			return await callNative(bindingName, functionName, args);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throwError(`${bindingName}.${functionName} failed: ${message}`);
		}
	};
}

export function loadBinding<T>(bindingName: BindingName): T {
	const functionNames = bindingFunctionNames[bindingName];
	if (functionNames === undefined) {
		throwError(`Unknown cashew native binding: ${bindingName}`);
	}

	const cache = new Map<string, NativeFunction>();
	const functionNameSet = new Set<string>(functionNames);

	return new Proxy(
		{},
		{
			get(_target, prop) {
				if (typeof prop !== 'string' || !functionNameSet.has(prop)) return undefined;
				const cached = cache.get(prop);
				if (cached !== undefined) return cached;

				const fn = createBindingFunction(bindingName, prop);
				cache.set(prop, fn);
				return fn;
			},
			ownKeys() {
				return [...functionNames];
			},
			getOwnPropertyDescriptor(_target, prop) {
				if (typeof prop !== 'string' || !functionNameSet.has(prop)) return undefined;
				return { enumerable: true, configurable: true };
			},
		}
	) as T;
}

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
