import { sleep, throwError } from '@lawlzer/utils';
import bindings from 'bindings';
const mouseAddon = bindings('mouse');

import type { Position } from '.';
import { Config } from './config';

export class Mouse {
	public static async click(options: { button?: 'left' | 'right'; position: Position; clickCount?: number; holdFor?: number; delayAfter?: number; windowTitle?: string }): Promise<void> {
		options.button ??= 'left';
		options.clickCount ??= 1;
		options.holdFor ??= 30;
		options.delayAfter ??= 30;

		const windowTitle = options?.windowTitle ?? Config.getProcessConfig().windowTitle ?? '';
		await mouseAddon.click(options.position.x, options.position.y, windowTitle, options.holdFor, options.delayAfter, options.clickCount, options.button);
	}

	public static async clickDesktop(options: { button?: 'left' | 'right'; position: Position; clickCount?: number; holdFor?: number; delayAfter?: number; windowTitle?: string }): Promise<void> {
		options.button ??= 'left';
		options.clickCount ??= 1;
		options.holdFor ??= 30;
		options.delayAfter ??= 30;

		await mouseAddon.clickDesktop(options.position.x, options.position.y, options.holdFor, options.delayAfter, options.clickCount, options.button);
	}

	public static async getPosition(): Promise<Position> {
		const windowTitle = '';
		return mouseAddon.getPosition(windowTitle);
	}
}
