import { throwError } from '@lawlzer/utils';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as v from 'valibot';

// Helper function to require modules dynamically

function dynamicRequire(moduleId: string): any {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require(moduleId);
}

// Get directory info for both ESM and CJS
function getDirInfo(): string {
	// Strategy 1: Try using require.resolve to find our package
	try {
		// Check if we're in Bun and require is available
		if (typeof Bun !== 'undefined' && typeof require !== 'undefined') {
			try {
				// Try to resolve our own package
				const resolved = require.resolve('@lawlzer/cashew/package.json');
				return path.dirname(resolved);
			} catch {
				// Try alternative resolution methods for Bun
				try {
					// Try to find the module in node_modules
					const Module = dynamicRequire('module');
					const paths = Module._nodeModulePaths?.(process.cwd()) || [];
					for (const modulePath of paths) {
						const packagePath = path.join(modulePath, '@lawlzer', 'cashew');
						const fs = dynamicRequire('fs');
						if (fs.existsSync(path.join(packagePath, 'package.json'))) {
							return packagePath;
						}
					}
				} catch {
					// Continue to next strategy
				}
			}
		}

		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const getRequire = new Function('return typeof require !== "undefined" ? require : null;');
		const req = getRequire() as NodeRequire | null;
		if (req) {
			try {
				// Try to resolve our own package
				const resolved = req.resolve('@lawlzer/cashew/package.json');
				return path.dirname(resolved);
			} catch {
				// Package might not be installed as a dependency
			}
		}
	} catch {
		// Fall through
	}

	// Strategy 2: Try to find the package using import.meta.resolve (for ESM)
	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const getImportMeta = new Function('return import.meta;');
		const importMeta = getImportMeta();
		if (importMeta) {
			if (typeof importMeta.resolve === 'function') {
				try {
					const resolved = importMeta.resolve('@lawlzer/cashew/package.json');
					const resolvedPath = resolved.startsWith('file://') ? fileURLToPath(resolved) : resolved;
					return path.dirname(resolvedPath);
				} catch {
					// Fall through to url fallback
				}
			}
			if (typeof importMeta.url === 'string' && importMeta.url.length > 0) {
				// Try using import.meta.url as a fallback
				try {
					const currentFileUrl = importMeta.url;
					const currentDir = path.dirname(fileURLToPath(currentFileUrl));
					// Look for the package root from the current file location
					let searchDir = currentDir;
					for (let i = 0; i < 10; i++) {
						if (searchDir.endsWith('cashew')) {
							return searchDir;
						}
						const parentDir = path.dirname(searchDir);
						if (parentDir === searchDir) break; // Reached root
						searchDir = parentDir;
					}
				} catch {
					// Fall through
				}
			}
		}
	} catch {
		// Fall through
	}

	// Strategy 3: Try to find via module paths
	try {
		// Check if we're in Bun and can access modules directly
		if (typeof Bun !== 'undefined' && typeof require !== 'undefined') {
			const Module = dynamicRequire('module');
			const fs = dynamicRequire('fs');
			const paths = Module._nodeModulePaths?.(process.cwd()) || [];

			for (const modulePath of paths) {
				const packagePath = path.join(modulePath, '@lawlzer', 'cashew');
				try {
					if (fs.existsSync(path.join(packagePath, 'package.json'))) {
						return packagePath;
					}
				} catch {
					// Continue searching
				}
			}
		} else {
			// Fallback to existing method for non-Bun environments

			const Module = dynamicRequire('module');
			const paths = Module._nodeModulePaths?.(process.cwd()) || [];

			for (const modulePath of paths) {
				const packagePath = path.join(modulePath, '@lawlzer', 'cashew');
				try {
					const fs = dynamicRequire('fs');
					if (fs.existsSync(path.join(packagePath, 'package.json'))) {
						return packagePath;
					}
				} catch {
					// Continue searching
				}
			}
		}
	} catch {
		// Fall through
	}

	// Strategy 4: Use process.cwd() as base and search for bindings
	// This is the most reliable for bundled code
	const cwd = process.cwd();

	// Common locations to search relative to cwd
	const searchDirs = [
		cwd,
		path.dirname(process.argv[1] || cwd), // Script location
		path.join(cwd, 'node_modules', '@lawlzer', 'cashew'),
		path.join(cwd, '..', 'node_modules', '@lawlzer', 'cashew'),
		path.join(cwd, '..', '..', 'node_modules', '@lawlzer', 'cashew'),
		// Add paths for when running from dist
		path.join(cwd, 'dist'),
		path.join(cwd, '..'),
		path.join(cwd, '..', '..'),
	];

	// For each search directory, check common build output locations
	for (const searchDir of searchDirs) {
		const candidates = [
			searchDir, // The directory itself
			path.join(searchDir, 'dist'),
			path.join(searchDir, 'build'),
		];

		for (const candidate of candidates) {
			// Check if this looks like the right directory by checking for expected structure
			try {
				// Try to load fs module
				const fs = dynamicRequire('fs');

				// Check if build/Release exists (where .node files are)
				const releaseDir = path.join(candidate, '..', 'build', 'Release');
				if (fs.existsSync(releaseDir)) {
					// Verify at least one .node file exists
					const files = fs.readdirSync(releaseDir);
					if (files.some((f: string) => f.endsWith('.node'))) {
						return path.dirname(releaseDir); // Return the package root
					}
				}

				// Also check if build/Release is directly under candidate
				const directReleaseDir = path.join(candidate, 'build', 'Release');
				if (fs.existsSync(directReleaseDir)) {
					const files = fs.readdirSync(directReleaseDir);
					if (files.some((f: string) => f.endsWith('.node'))) {
						return candidate; // Return the package root
					}
				}
			} catch {
				// Continue searching
			}
		}
	}

	// Final fallback: just use cwd
	// The binding loader will have to figure out the paths
	return cwd;
}

// Create require function for both ESM and CJS
function createRequireFunction(): NodeRequire {
	// Check if we're in Bun - use special handling

	if (typeof Bun !== 'undefined') {
		// If require is available in Bun, use it
		if (typeof require !== 'undefined') {
			return require;
		}

		// For Bun without require, create a special loader
		const bunLoader = ((id: string) => {
			if (id.endsWith('.node')) {
				// Use process.dlopen directly for native modules in Bun
				const mod = { exports: {} };
				try {
					process.dlopen(mod, id);
					return mod.exports;
				} catch (err) {
					throw new Error(`Failed to load native module ${id} in Bun: ${String(err)}`);
				}
			}
			throw new Error(`Cannot require ${id} in Bun without require`);
		}) as any;

		bunLoader.resolve = (id: string) =>
			// Simple resolution for Bun
			id;

		return bunLoader as NodeRequire;
	}

	// Try to get require function
	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const getRequire = new Function('return typeof require !== "undefined" ? require : null;');
		const req = getRequire() as NodeRequire | null;
		if (req) {
			return req;
		}
	} catch {
		// Fall through
	}

	// For Bun, try to use Bun.require if available

	if (typeof Bun !== 'undefined' && (Bun as any).require) {
		return (Bun as any).require as NodeRequire;
	}

	// Create a minimal require function that throws helpful errors
	// This ensures we fail gracefully when require is not available
	const mockRequire = ((id: string) => {
		if (id.endsWith('.node')) {
			// Try to use process.dlopen as a last resort
			if (process.dlopen !== undefined) {
				const mod = { exports: {} };
				try {
					process.dlopen(mod, id);
					return mod.exports;
				} catch (err) {
					throw new Error(`Cannot load native module ${id} - dlopen failed: ${String(err)}`);
				}
			}
			throw new Error(`Cannot load native module ${id} - require not available in this environment`);
		}
		throw new Error(`Cannot require ${id} - require not available in this environment`);
	}) as any;

	mockRequire.resolve = (id: string) => {
		throw new Error(`Cannot resolve ${id} - require not available in this environment`);
	};

	return mockRequire as NodeRequire;
}

const requireFunction = createRequireFunction();

// Load native binding with multiple path attempts
function loadNativeBinding(name: string): unknown {
	const bindingName = `${name}.node`;

	// Special handling for Bun

	if (typeof Bun !== 'undefined') {
		try {
			// Try using Bun's native require if available
			if (typeof require === 'function') {
				// Try common paths for Bun
				const bunPaths = [path.join(process.cwd(), 'node_modules', '@lawlzer', 'cashew', 'build', 'Release', bindingName), path.join(process.cwd(), 'node_modules', '@lawlzer', 'cashew', 'dist', 'build', 'Release', bindingName)];

				// Try direct loading with require
				for (const p of bunPaths) {
					try {
						return dynamicRequire(p);
					} catch {
						// Try next path
					}
				}

				// Try using process.dlopen for Bun
				try {
					const fs = dynamicRequire('fs');
					for (const p of bunPaths) {
						if (fs.existsSync(p)) {
							const mod = { exports: {} };
							process.dlopen(mod, p);
							return mod.exports;
						}
					}
				} catch {
					// Continue to regular loading
				}
			}
		} catch {
			// Fall through to regular loading
		}
	}

	const packageRoot = getDirInfo();

	// Build comprehensive list of paths to try
	const paths = [
		// Direct require attempts
		name,
		bindingName,

		// Paths relative to package root
		path.join(packageRoot, 'build', 'Release', bindingName),
		path.join(packageRoot, 'build', 'Debug', bindingName),
		path.join(packageRoot, 'dist', 'build', 'Release', bindingName),

		// Paths relative to current directory (for when running from source)
		path.join(process.cwd(), 'build', 'Release', bindingName),
		path.join(process.cwd(), 'build', 'Debug', bindingName),

		// For when the package is installed as a dependency
		path.join(process.cwd(), 'node_modules', '@lawlzer', 'cashew', 'build', 'Release', bindingName),
		path.join(process.cwd(), 'node_modules', '@lawlzer', 'cashew', 'dist', 'build', 'Release', bindingName),
		path.join(process.cwd(), '..', 'node_modules', '@lawlzer', 'cashew', 'build', 'Release', bindingName),
		path.join(process.cwd(), '..', 'node_modules', '@lawlzer', 'cashew', 'dist', 'build', 'Release', bindingName),
		path.join(process.cwd(), '..', '..', 'node_modules', '@lawlzer', 'cashew', 'build', 'Release', bindingName),
		path.join(process.cwd(), '..', '..', 'node_modules', '@lawlzer', 'cashew', 'dist', 'build', 'Release', bindingName),

		// Legacy paths for compatibility
		path.join(packageRoot, '..', 'build', 'Release', bindingName),
		path.join(packageRoot, '..', '..', 'build', 'Release', bindingName),
	];

	// Add Bun-specific paths

	if (typeof Bun !== 'undefined') {
		// Bun might resolve modules differently, add more potential paths
		const scriptDir = path.dirname(process.argv[1] || process.cwd());
		paths.push(
			// Try relative to the script location
			path.join(scriptDir, 'node_modules', '@lawlzer', 'cashew', 'build', 'Release', bindingName),
			path.join(scriptDir, 'node_modules', '@lawlzer', 'cashew', 'dist', 'build', 'Release', bindingName),
			path.join(scriptDir, '..', 'node_modules', '@lawlzer', 'cashew', 'build', 'Release', bindingName),
			path.join(scriptDir, '..', 'node_modules', '@lawlzer', 'cashew', 'dist', 'build', 'Release', bindingName)
		);

		// Add paths for when running from a bundled dist file
		// Look for node_modules in parent directories
		let currentDir = process.cwd();
		for (let i = 0; i < 5; i++) {
			paths.push(path.join(currentDir, 'node_modules', '@lawlzer', 'cashew', 'build', 'Release', bindingName), path.join(currentDir, 'node_modules', '@lawlzer', 'cashew', 'dist', 'build', 'Release', bindingName));
			currentDir = path.dirname(currentDir);
		}
	}

	// Additional paths for edge cases
	// Try to resolve the module location directly
	try {
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		if (typeof require !== 'undefined' && require.resolve) {
			try {
				// Try to resolve the package first
				const packagePath = require.resolve('@lawlzer/cashew/package.json');
				const packageDir = path.dirname(packagePath);
				paths.push(path.join(packageDir, 'build', 'Release', bindingName), path.join(packageDir, 'dist', 'build', 'Release', bindingName));
			} catch {
				// Try to resolve the binding directly
				try {
					const resolvedPath = require.resolve(`@lawlzer/cashew/build/Release/${bindingName}`);
					paths.push(resolvedPath);
				} catch {
					// Continue with other paths
				}
			}
		}
	} catch {
		// Continue with other strategies
	}

	// For linked packages, also check the actual cashew directory
	// When running from dist/index.js, we need to go up to find build/Release
	if (packageRoot.includes('dist')) {
		const actualPackageRoot = path.dirname(packageRoot);
		paths.push(path.join(actualPackageRoot, 'build', 'Release', bindingName), path.join(actualPackageRoot, 'dist', 'build', 'Release', bindingName));
	}

	// Remove duplicates while preserving order
	const uniquePaths = [...new Set(paths)];

	// Try to find which paths actually exist (for better error reporting)
	const existingPaths: string[] = [];
	try {
		// Try to load fs module for existence checking
		const fs = dynamicRequire('fs');
		for (const p of uniquePaths) {
			try {
				if (fs.existsSync(p)) {
					existingPaths.push(p);
				}
			} catch {
				// Ignore errors checking existence
			}
		}
	} catch {
		// fs not available, skip existence check
	}

	// Special handling for Bun - try dlopen first

	if (typeof Bun !== 'undefined' && existingPaths.length > 0) {
		for (const bindingPath of existingPaths) {
			try {
				const mod = { exports: {} };
				process.dlopen(mod, bindingPath);
				return mod.exports;
			} catch {
				// Try next path
			}
		}
	}

	// Try to load from existing paths first
	for (const bindingPath of existingPaths) {
		try {
			return requireFunction(bindingPath);
		} catch (err) {
			// Log but continue trying
			console.warn(`Failed to load ${bindingPath}:`, err instanceof Error ? err.message : err);
		}
	}

	// Try all paths (in case fs.existsSync didn't work)
	for (const bindingPath of uniquePaths) {
		try {
			return requireFunction(bindingPath);
		} catch {
			// Try next path
		}
	}

	// Provide helpful error message
	const errorMessage = `Could not load ${name} binding. Searched paths:\n${uniquePaths.map((p) => `  - ${p}`).join('\n')}\n\nMake sure the native bindings are built (npm run build:cpp) and the package is properly installed.`;
	throwError(errorMessage);
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
	holdKeyForDuration: functionSchema,
});

export const mouseSchema = v.object({
	click: functionSchema,
	clickMessage: functionSchema,
	getPosition: functionSchema,
	hold: functionSchema,
	release: functionSchema,
	moveRelative: functionSchema,
	moveRelativePolar: functionSchema,
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
	holdKey: (keyCode: number, windowTitle?: string) => Promise<void>;
	releaseKey: (keyCode: number, windowTitle?: string) => Promise<void>;
	isKeyPressed: (keyCode: number) => Promise<boolean>;
	type: (keycodes: number[], windowTitle: string, delayPerKey: number) => Promise<boolean>;
	tapKey: (keyCode: number, windowTitle?: string) => Promise<void>;
	holdKeyForDuration: (keyCode: number, duration: number) => Promise<void>;
}

export interface MouseBinding {
	click: (x: number | null, y: number | null, button: string, holdFor: number, windowTitle?: string) => Promise<void>;
	clickMessage: (x: number, y: number, holdFor: number, windowTitle: string, messageType: string) => Promise<void>;
	getPosition: () => Promise<{ x: number; y: number }>;
	hold: (x: number | null, y: number | null, button: string) => Promise<void>;
	release: (x: number | null, y: number | null, button: string) => Promise<void>;
	moveRelative: (dx: number, dy: number, smoothDuration: number, useRawInput: boolean) => Promise<void>;
	moveRelativePolar: (angle: number, distance: number, smoothDuration: number, useRawInput: boolean) => Promise<void>;
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
