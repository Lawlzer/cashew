import { loadBinding, type MouseBinding, mouseSchema } from './bindingLoader';
import { Config } from './config';
import type { Position } from './misc';

// Load binding
const mouseBinding = loadBinding<MouseBinding>('mouse', mouseSchema);

export interface ClickOptions {
	button?: 'left' | 'right';
	position?: Position;
	clickCount?: number;
	holdFor?: number;
	delayAfter?: number;
}

export class Mouse {
	/**
	 * Send a click message to a window (works even when window is in background)
	 */
	public static async clickMessage(options: { position: Position; windowTitle: string; type: 'post' | 'send'; holdFor?: number }): Promise<void> {
		const holdFor = options.holdFor ?? 0;
		await mouseBinding.clickMessage(options.position.x, options.position.y, holdFor, options.windowTitle, options.type);
	}

	/**
	 * Standard click that moves mouse to position and clicks
	 */
	public static async click(options?: { button?: 'left' | 'right'; position?: Position; holdFor?: number; windowTitle?: string }): Promise<void> {
		const button = options?.button ?? 'left';
		const holdFor = options?.holdFor ?? 0;
		const windowTitle = options?.windowTitle ?? Config.windowTitle ?? '';

		// Pass null for x/y if no position specified
		const x = options?.position?.x ?? null;
		const y = options?.position?.y ?? null;

		await mouseBinding.click(x, y, button, holdFor, windowTitle);
	}

	public static async getPosition(): Promise<Position> {
		const pos = await mouseBinding.getPosition();
		return {
			x: pos.x,
			y: pos.y,
		};
	}

	public static async hold(options: { button?: 'left' | 'right'; position?: Position }): Promise<void> {
		const button = options.button ?? 'left';
		const x = options.position?.x ?? null;
		const y = options.position?.y ?? null;
		await mouseBinding.hold(x, y, button);
	}

	public static async release(options: { button?: 'left' | 'right'; position?: Position }): Promise<void> {
		const button = options.button ?? 'left';
		const x = options.position?.x ?? null;
		const y = options.position?.y ?? null;
		await mouseBinding.release(x, y, button);
	}

	/**
	 * Move mouse relative to current position with optional smooth animation
	 */
	public static async moveRelative(options: { dx: number; dy: number; smoothDuration?: number; useRawInput?: boolean }): Promise<void> {
		const smoothDuration = options.smoothDuration ?? 0;
		const useRawInput = options.useRawInput ?? false;
		await mouseBinding.moveRelative(options.dx, options.dy, smoothDuration, useRawInput);
	}

	/**
	 * Move mouse in a direction by angle and distance
	 * @param angle Angle in degrees (0 = right, 90 = up, 180 = left, 270 = down)
	 * @param distance Distance in pixels
	 */
	public static async moveRelativePolar(options: { angle: number; distance: number; smoothDuration?: number; useRawInput?: boolean }): Promise<void> {
		const smoothDuration = options.smoothDuration ?? 0;
		const useRawInput = options.useRawInput ?? false;
		await mouseBinding.moveRelativePolar(options.angle, options.distance, smoothDuration, useRawInput);
	}

	/**
	 * Set mouse position to absolute screen coordinates
	 * @param position Target position {x, y}
	 * @param smoothDuration Optional duration in milliseconds for smooth movement (0 = instant)
	 * @param windowTitle Optional window title for client coordinate conversion
	 */
	public static async setPosition(options: { position: Position; smoothDuration?: number; windowTitle?: string }): Promise<void> {
		const smoothDuration = options.smoothDuration ?? 0;
		const windowTitle = options.windowTitle ?? '';
		await mouseBinding.setPosition(options.position.x, options.position.y, smoothDuration, windowTitle);
	}
}
