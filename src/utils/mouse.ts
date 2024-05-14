import { sleep } from '@lawlzer/utils';
import bindings from 'bindings';
const mouseAddon = bindings('mouse');

import type { Position } from '.';

export class Mouse {
	public static async click(options: { button?: 'left' | 'right'; clickCount?: number; holdFor?: number; position: Position; delayAfter?: number; windowTitle?: string }) {
		options.button ??= 'left';
		options.clickCount ??= 1;
		options.holdFor ??= 30;
		options.delayAfter ??= 30;

		const windowTitle = options?.windowTitle ?? ''; 
		await mouseAddon.click(options.position.x, options.position.y, windowTitle, options.holdFor, options.delayAfter, options.clickCount, options.button);
	}

	public static async getPosition() {
		const windowTitle = ''; 
		return mouseAddon.getPosition(windowTitle);
	}
}
