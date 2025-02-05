import { sleep, throwError } from '@lawlzer/utils';
import bindings from 'bindings';
const mouseAddon = bindings('mouse');

import type { Position } from '.';
import { Config } from './config';

export class Mouse {
	/**
	 * WARNING: "holdFor" and "delayAfter" are ran in CPP, and are therefore blocking.
	 *
	 * This function is (probably long-term/forever) disabled, because Windows does not seem to allow you to click on background applications, without bringing them to the foreground first.
	 */
	public static async click(options: { button?: 'left' | 'right'; position: Position; clickCount?: number; holdFor?: number; delayAfter?: number; windowTitle?: string }): Promise<void> {
		// options.button ??= 'left';
		// options.clickCount ??= 1;
		// options.holdFor ??= 30;
		// options.delayAfter ??= 30;
		// const windowTitle = options?.windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		// await mouseAddon.click(options.position.x, options.position.y, windowTitle, options.holdFor, options.delayAfter, options.clickCount, options.button);
	}

	public static async clickDesktop(options: { button?: 'left' | 'right'; position: Position; clickCount?: number; holdFor?: number; delayAfter?: number }): Promise<void> {
		options.button ??= 'left';
		options.clickCount ??= 1;
		options.holdFor ??= 30;
		options.delayAfter ??= 30;

		await mouseAddon.clickDesktop(options.position.x, options.position.y, options.holdFor, options.delayAfter, options.clickCount, options.button);
	}

	public static async getPosition(options?: { windowTitle?: string }): Promise<Position> {
		const windowTitle = options?.windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		const position = await mouseAddon.getPosition(windowTitle);

		function isPosition(pos: any): pos is Position {
			return typeof pos === 'object' && typeof pos.x === 'number' && typeof pos.y === 'number';
		}

		if (!isPosition(position)) throwError('position was not an object: ', position);
		return position;
	}

	public static async hold(options: { button?: 'left' | 'right'; position: Position; windowTitle?: string }): Promise<void> {
		options.button ??= 'left';
		const windowTitle = options?.windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		await mouseAddon.hold(options.position.x, options.position.y, windowTitle, options.button);
	}

	public static async release(options: { button?: 'left' | 'right'; position: Position; windowTitle?: string }): Promise<void> {
		options.button ??= 'left';
		const windowTitle = options?.windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		await mouseAddon.release(options.position.x, options.position.y, windowTitle, options.button);
	}
}
