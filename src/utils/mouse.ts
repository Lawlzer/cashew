import { sleep, throwError } from '@lawlzer/utils';
import bindings from 'bindings';
const mouseAddon = bindings('mouse');

import type { Position } from './misc';
import { Config } from './config';

function isPosition(pos: any): pos is Position {
	return typeof pos === 'object' && typeof pos.x === 'number' && typeof pos.y === 'number';
}

export class Mouse {
	/**
	 * WARNING: "holdFor" and "delayAfter" are ran in CPP, and are therefore blocking.
	 *
	 * This function is (probably long-term/forever) disabled, because Windows does not seem to allow you to click on background applications, without bringing them to the foreground first.
	 */

	// public static async click(options: { button?: 'left' | 'right'; position: Position; clickCount?: number; holdFor?: number; delayAfter?: number }): Promise<void> {
	// 	throwError('Mouse.click is disabled --- Windows does not allow you to click on background applications, without bringing them to the foreground first.');
	// }

	/**
	 * An alternative to clickDesktop, that *attempts* to click on background windows. will likely fail :(
	 */
	public static async clickMessage(options: { position: Position; windowTitle: string; type: 'post' | 'send'; holdFor?: number }): Promise<void> {
		const holdFor = options.holdFor ?? 30;
		// We are hardcoding button to left implicitly via WM_LBUTTONDOWN/UP in C++.
		// If right/middle clicks are needed later, the C++ side would need adjustment.
		await mouseAddon.clickMessage(options.position.x, options.position.y, holdFor, options.windowTitle, options.type);
	}

	public static async click(options?: { button?: 'left' | 'right'; position?: Position; holdFor?: number; windowTitle?: string }): Promise<void> {
		const button = options?.button ?? 'left';
		const holdFor = options?.holdFor ?? 30;
		const x = options?.position?.x ?? null;
		const y = options?.position?.y ?? null;
		const windowTitle = options?.windowTitle;

		// We might need to ensure the C++ side explicitly checks for Napi::Value::IsUndefined() or expects a Null/empty string.
		// Passing undefined might implicitly convert to null depending on N-API/Node.js version behavior. Let's explicitly pass an empty string if undefined.
		// await mouseAddon.clickDesktop(x, y, button, holdFor, windowTitle ?? '');
		await mouseAddon.click(x, y, button, holdFor, windowTitle ?? '');
	}

	public static async getPosition(): Promise<Position> {
		const position = await mouseAddon.getPosition();

		if (!isPosition(position)) throwError('position was not an object: ', position);
		return position;
	}

	public static async hold(options: { button?: 'left' | 'right'; position?: Position }): Promise<void> {
		options.button ??= 'left';
		const x = options.position?.x ?? null;
		const y = options.position?.y ?? null;
		await mouseAddon.hold(x, y, options.button);
	}

	public static async release(options: { button?: 'left' | 'right'; position?: Position }): Promise<void> {
		options.button ??= 'left';
		const x = options.position?.x ?? null;
		const y = options.position?.y ?? null;
		await mouseAddon.release(x, y, options.button);
	}
}
