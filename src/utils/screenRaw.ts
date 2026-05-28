import { throwError } from '@lawlzer/utils';

import { loadBinding, type ScreenRawBinding } from './bindingLoader';
import type { Position } from './misc';
import type { rgb } from './screen';

const screenRawBinding = loadBinding<ScreenRawBinding>('screenRaw');

export class ScreenRaw {
	/**
	 * Draws a colored square/rectangle on the screen at the specified position with given dimensions.
	 * @param position The position {x, y} of the top-left corner
	 * @param size The dimensions {width, height} of the rectangle
	 * @param color The RGB color {r, g, b} of the rectangle
	 * @returns Promise resolving to true if successful
	 */
	public static async setSquare(position: Position, size: { width: number; height: number }, color: rgb): Promise<boolean> {
		if (color.r < 0 || color.r > 255 || color.g < 0 || color.g > 255 || color.b < 0 || color.b > 255) {
			throwError('RGB values must be between 0 and 255');
		}

		const result = await screenRawBinding.setSquare(position.x, position.y, size.width, size.height, color.r, color.g, color.b);

		if (!result) throwError(`Invalid result: ${result}`);
		return true;
	}

	/**
	 * Clears any currently drawn square from the screen.
	 * @returns Promise resolving to true if successful
	 */
	public static async clearSquare(): Promise<boolean> {
		const result = await screenRawBinding.clearSquare();

		if (!result) throwError(`Invalid result: ${result}`);
		return true;
	}
}
