import { throwError } from '@lawlzer/utils';
import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as v from 'valibot';

// Get directory info for both ESM and CJS
function getDirInfo(): string {
	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const getMetaUrl = new Function('return import.meta?.url;');
		const url = getMetaUrl() as string | undefined;
		if (url !== undefined && url !== null && url.length > 0) {
			return path.dirname(fileURLToPath(url));
		}
	} catch {
		// Fall through to CJS
	}

	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const getDirname = new Function('return __dirname;');
		return getDirname() as string;
	} catch {
		throw new Error('Unable to determine current directory');
	}
}

// Create require function for both ESM and CJS
function createRequireFunction(): NodeRequire {
	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const getMetaUrl = new Function('return import.meta?.url;');
		const url = getMetaUrl() as string | undefined;
		if (url !== undefined && url !== null && url.length > 0) {
			return createRequire(url);
		}
	} catch {
		// Fall through to CJS
	}

	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const getRequire = new Function('return require;');
		return getRequire() as NodeRequire;
	} catch {
		throw new Error('Unable to create require function');
	}
}

const currentDirname = getDirInfo();
const requireFunction = createRequireFunction();

// Load native binding with multiple path attempts
function loadNativeBinding(name: string): unknown {
	const paths = [name, path.join(currentDirname, '..', 'build', 'Release', `${name}.node`), path.join(currentDirname, '..', '..', 'build', 'Release', `${name}.node`)];

	for (const bindingPath of paths) {
		try {
			return requireFunction(bindingPath);
		} catch {
			// Try next path
		}
	}

	throwError(`Could not load ${name} binding. Tried paths: ${paths.join(', ')}`);
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
	isKeyPressed: functionSchema,
	type: functionSchema,
	tapKey: functionSchema,
});

export const mouseSchema = v.object({
	click: functionSchema,
	clickMessage: functionSchema,
	getPosition: functionSchema,
	hold: functionSchema,
	release: functionSchema,
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

	for (const [key, value] of Object.entries(binding)) {
		if (typeof value === 'function') {
			proxiedBinding[key] = async (...args: any[]): Promise<any> => {
				try {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-return
					return await value(...args);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					throwError(`${bindingName}.${key} failed: ${message}`);
				}
			};
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
	holdKey: (keyCode: number, windowTitle: string) => Promise<void>;
	releaseKey: (keyCode: number, windowTitle: string) => Promise<void>;
	isKeyPressed: (keyCode: number) => Promise<boolean>;
	type: (keycodes: number[], windowTitle: string, delayPerKey: number) => Promise<boolean>;
	tapKey: (keyCode: number, windowTitle: string) => Promise<void>;
}

export interface MouseBinding {
	click: (x: number | null, y: number | null, button: string, holdFor: number, windowTitle?: string) => Promise<void>;
	clickMessage: (x: number, y: number, holdFor: number, windowTitle: string, messageType: string) => Promise<void>;
	getPosition: () => Promise<{ x: number; y: number }>;
	hold: (x: number | null, y: number | null, button: string) => Promise<void>;
	release: (x: number | null, y: number | null, button: string) => Promise<void>;
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
