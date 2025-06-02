import { throwError } from '@lawlzer/utils';
import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a require function for loading native modules
const require = createRequire(import.meta.url);

// Helper function to load native bindings with correct path resolution
export function loadBinding(name: string): unknown {
	try {
		// Try the standard require path first (for development)
		return require(name);
	} catch (error: unknown) {
		try {
			// Calculate the path to the native binding relative to this module
			// When the package is installed, the structure is:
			// node_modules/@lawlzer/cashew/dist/utils/bindingLoader.js
			// node_modules/@lawlzer/cashew/dist/build/Release/{name}.node
			const bindingPath = path.join(__dirname, '..', 'build', 'Release', `${name}.node`);
			return require(bindingPath);
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
		} catch (errorPath: unknown) {
			// Try alternative paths for different installation scenarios
			try {
				// For local development or npm link scenarios
				const devBindingPath = path.join(__dirname, '..', '..', 'build', 'Release', `${name}.node`);
				return require(devBindingPath);
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
			} catch (errorDev: unknown) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				throwError(`Could not load ${name} binding. Tried multiple paths. Original error: ${errorMessage}`);
			}
		}
	}
}
