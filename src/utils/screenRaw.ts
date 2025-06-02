import { throwError } from '@lawlzer/utils';
import { loadTypedBinding, type BindingSchema, createValidatedFunction } from './bindingLoader';
import type { Position } from './misc';
import type { rgb } from './screen';

interface ScreenRawBinding {
	setSquare: (x: number, y: number, width: number, height: number, r: number, g: number, b: number) => Promise<boolean>;
	clearSquare: () => Promise<boolean>;
}

// Define the schema for the screenRaw binding
const screenRawBindingSchema: BindingSchema = {
	setSquare: {
		type: 'function',
		params: [
			{ name: 'x', type: 'number' },
			{ name: 'y', type: 'number' },
			{ name: 'width', type: 'number' },
			{ name: 'height', type: 'number' },
			{ name: 'r', type: 'number' },
			{ name: 'g', type: 'number' },
			{ name: 'b', type: 'number' },
		],
		returnType: 'boolean',
	},
	clearSquare: {
		type: 'function',
		params: [],
		returnType: 'boolean',
	},
};

// Custom validator for ScreenRawBinding
function isScreenRawBinding(binding: unknown): binding is ScreenRawBinding {
	return typeof binding === 'object' && binding !== null && 'setSquare' in binding && 'clearSquare' in binding && typeof (binding as any).setSquare === 'function' && typeof (binding as any).clearSquare === 'function';
}

// Load the binding with proper typing and validation
const screenRawBinding = loadTypedBinding<ScreenRawBinding>('screenRaw', screenRawBindingSchema, isScreenRawBinding);

// Create validated wrapper functions with runtime type checking
const setSquareValidated = createValidatedFunction(screenRawBinding.setSquare, 'setSquare', 'boolean');

const clearSquareValidated = createValidatedFunction(screenRawBinding.clearSquare, 'clearSquare', 'boolean');

export class ScreenRaw {
	/**
	 * Draws a colored square/rectangle on the screen at the specified position with given dimensions.
	 * @param position The position {x, y} of the top-left corner
	 * @param size The dimensions {width, height} of the rectangle
	 * @param color The RGB color {r, g, b} of the rectangle
	 * @returns Promise resolving to true if successful
	 */
	public static async setSquare(position: Position, size: { width: number; height: number }, color: rgb): Promise<boolean> {
		if (typeof position.x !== 'number' || typeof position.y !== 'number') {
			throwError('Position must have numeric x and y coordinates');
		}

		if (typeof size.width !== 'number' || typeof size.height !== 'number') {
			throwError('Size must have numeric width and height values');
		}

		if (typeof color.r !== 'number' || typeof color.g !== 'number' || typeof color.b !== 'number') {
			throwError('Color must have numeric r, g, and b values');
		}

		if (color.r < 0 || color.r > 255 || color.g < 0 || color.g > 255 || color.b < 0 || color.b > 255) {
			throwError('RGB values must be between 0 and 255');
		}

		const result = await setSquareValidated(position.x, position.y, size.width, size.height, color.r, color.g, color.b);

		if (!result) throwError(`Invalid result: ${result}`);
		return true;
	}

	/**
	 * Clears any currently drawn square from the screen.
	 * @returns Promise resolving to true if successful
	 */
	public static async clearSquare(): Promise<boolean> {
		const result = await clearSquareValidated();

		if (!result) throwError(`Invalid result: ${result}`);
		return true;
	}
}
