import { throwError } from '@lawlzer/utils';
import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Declare global variables for CJS compatibility
declare const __filename: string;
declare const __dirname: string;
declare const require: NodeRequire;

// Helper function to safely check if we're in ESM environment
function isESMEnvironment(): boolean {
	return typeof import.meta?.url === 'string';
}

// Helper function to get import.meta.url safely
function getImportMetaUrl(): string | null {
	return import.meta?.url ?? null;
}

// Helper function to get __filename and __dirname in both ESM and CJS
function getDirInfo(): { __filename: string; __dirname: string } {
	// Check if we're in an ESM environment
	if (isESMEnvironment()) {
		const importMetaUrl = getImportMetaUrl();
		if (importMetaUrl !== null) {
			const filename = fileURLToPath(importMetaUrl);
			const dirname = path.dirname(filename);
			return { __filename: filename, __dirname: dirname };
		}
	}

	// We're in a CJS environment - use global variables
	// Note: In CJS, these globals are always available
	if (typeof __filename !== 'undefined' && typeof __dirname !== 'undefined') {
		return { __filename, __dirname };
	}

	// Fallback - this shouldn't happen in normal usage
	throw new Error('Unable to determine current file location in either ESM or CJS environment');
}

// Get the directory info using the helper
const { __filename: _currentFilename, __dirname: currentDirname } = getDirInfo();

// Create a require function that works in both ESM and CJS
function createRequireFunction(): NodeRequire {
	// Check if we're in an ESM environment
	if (isESMEnvironment()) {
		const importMetaUrl = getImportMetaUrl();
		if (importMetaUrl !== null) {
			return createRequire(importMetaUrl);
		}
	}

	// We're in a CJS environment - use the global require
	if (typeof require !== 'undefined') {
		return require;
	}

	// Fallback - this shouldn't happen in normal usage
	throw new Error('Unable to create require function in either ESM or CJS environment');
}

const requireFunction = createRequireFunction();

// Helper function to load native bindings with correct path resolution
export function loadBinding(name: string): unknown {
	try {
		// Try the standard require path first (for development)
		return requireFunction(name);
	} catch (error: unknown) {
		try {
			// Calculate the path to the native binding relative to this module
			// When the package is installed, the structure is:
			// node_modules/@lawlzer/cashew/dist/utils/bindingLoader.js
			// node_modules/@lawlzer/cashew/dist/build/Release/{name}.node
			const bindingPath = path.join(currentDirname, '..', 'build', 'Release', `${name}.node`);
			return requireFunction(bindingPath);
		} catch (_errorPath: unknown) {
			// Try alternative paths for different installation scenarios
			try {
				// For local development or npm link scenarios
				const devBindingPath = path.join(currentDirname, '..', '..', 'build', 'Release', `${name}.node`);
				return requireFunction(devBindingPath);
			} catch (_errorDev: unknown) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				throwError(`Could not load ${name} binding. Tried multiple paths. Original error: ${errorMessage}`);
			}
		}
	}
}

// Type definition for binding schema - describes expected functions and their signatures
export type BindingSchema = Record<
	string,
	{
		type: 'function';
		params?: { name: string; type: string; optional?: boolean }[];
		returnType?: string;
	}
>;

// Create a schema-based validator function
function createSchemaValidator<T>(schema: BindingSchema): (binding: unknown) => binding is T {
	return (binding: unknown): binding is T => {
		if (!binding || typeof binding !== 'object') {
			return false;
		}

		const bindingObj = binding as Record<string, any>;

		// Check that all required functions exist and are actually functions
		for (const [functionName, functionSchema] of Object.entries(schema)) {
			if (functionSchema.type === 'function') {
				if (!(functionName in bindingObj) || typeof bindingObj[functionName] !== 'function') {
					return false;
				}
			}
		}

		return true;
	};
}

// Generic function to load and validate a typed binding
export function loadTypedBinding<T extends Record<string, any>>(bindingName: string, schema: BindingSchema, customValidator?: (binding: unknown) => binding is T): T {
	const rawBinding = loadBinding(bindingName);

	// Use custom validator if provided, otherwise use schema-based validation
	const isValidBinding = customValidator ? customValidator : createSchemaValidator<T>(schema);

	if (!isValidBinding(rawBinding)) {
		const expectedFunctions = Object.keys(schema).join(', ');
		throwError(`${bindingName} binding does not have the expected functions. Expected: ${expectedFunctions}`);
	}

	return rawBinding;
}

// Convenience function to create a runtime-validated function wrapper
export function createValidatedFunction<TArgs extends any[], TReturn>(originalFunc: (...args: TArgs) => Promise<TReturn>, functionName: string, expectedReturnType?: string, returnTypeValidator?: (value: unknown) => value is TReturn): (...args: TArgs) => Promise<TReturn> {
	return async (...args: TArgs): Promise<TReturn> => {
		const result = await originalFunc(...args);

		// If we have a custom validator, use it
		if (returnTypeValidator) {
			if (!returnTypeValidator(result)) {
				const expectedTypeDesc = expectedReturnType ?? 'custom type';
				throwError(`${functionName} returned unexpected type. Got: ${typeof result}, Expected: ${expectedTypeDesc}`);
			}
		}
		// Otherwise, do basic type checking if expectedReturnType is provided
		else if (expectedReturnType != null && expectedReturnType.length > 0) {
			if (typeof result !== expectedReturnType && result !== null) {
				throwError(`${functionName} returned unexpected type. Got: ${typeof result}, Expected: ${expectedReturnType}`);
			}
		}

		return result;
	};
}
