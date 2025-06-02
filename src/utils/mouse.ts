import { throwError } from '@lawlzer/utils';
import { loadTypedBinding, type BindingSchema, createValidatedFunction } from './bindingLoader';

interface MouseBinding {
	clickMessage: (x: number, y: number, holdFor: number, windowTitle: string, type: 'post' | 'send') => Promise<void>;
	click: (x: number | null, y: number | null, button: string, holdFor: number, windowTitle: string) => Promise<void>;
	getPosition: () => Promise<{ x: number; y: number }>;
	hold: (x: number | null, y: number | null, button: string) => Promise<void>;
	release: (x: number | null, y: number | null, button: string) => Promise<void>;
}

// Define the schema for the mouse binding
const mouseBindingSchema: BindingSchema = {
	clickMessage: {
		type: 'function',
		params: [
			{ name: 'x', type: 'number' },
			{ name: 'y', type: 'number' },
			{ name: 'holdFor', type: 'number' },
			{ name: 'windowTitle', type: 'string' },
			{ name: 'type', type: 'string' },
		],
		returnType: 'undefined',
	},
	click: {
		type: 'function',
		params: [
			{ name: 'x', type: 'number' }, // Can be null but schema describes expected type
			{ name: 'y', type: 'number' }, // Can be null but schema describes expected type
			{ name: 'button', type: 'string' },
			{ name: 'holdFor', type: 'number' },
			{ name: 'windowTitle', type: 'string' },
		],
		returnType: 'undefined',
	},
	getPosition: {
		type: 'function',
		params: [],
		returnType: 'object',
	},
	hold: {
		type: 'function',
		params: [
			{ name: 'x', type: 'number' }, // Can be null
			{ name: 'y', type: 'number' }, // Can be null
			{ name: 'button', type: 'string' },
		],
		returnType: 'undefined',
	},
	release: {
		type: 'function',
		params: [
			{ name: 'x', type: 'number' }, // Can be null
			{ name: 'y', type: 'number' }, // Can be null
			{ name: 'button', type: 'string' },
		],
		returnType: 'undefined',
	},
};

// Custom validator for MouseBinding
function isMouseBinding(binding: unknown): binding is MouseBinding {
	return typeof binding === 'object' && binding !== null && 'clickMessage' in binding && 'click' in binding && 'getPosition' in binding && 'hold' in binding && 'release' in binding && typeof (binding as any).clickMessage === 'function' && typeof (binding as any).click === 'function' && typeof (binding as any).getPosition === 'function' && typeof (binding as any).hold === 'function' && typeof (binding as any).release === 'function';
}

// Load the binding with proper typing and validation
const mouseBinding = loadTypedBinding<MouseBinding>('mouse', mouseBindingSchema, isMouseBinding);

// Create validated wrapper functions with runtime type checking
const clickMessageValidated = createValidatedFunction(mouseBinding.clickMessage, 'clickMessage', 'undefined');

const clickValidated = createValidatedFunction(mouseBinding.click, 'click', 'undefined');

const getPositionValidated = createValidatedFunction(mouseBinding.getPosition, 'getPosition', 'object', (value): value is { x: number; y: number } => typeof value === 'object' && value !== null && 'x' in value && 'y' in value && typeof (value as any).x === 'number' && typeof (value as any).y === 'number');

const holdValidated = createValidatedFunction(mouseBinding.hold, 'hold', 'undefined');

const releaseValidated = createValidatedFunction(mouseBinding.release, 'release', 'undefined');

import type { Position } from './misc';

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
	// 	throwError('Mouse.click is disabled --- Windows do not seem to allow you to click on background applications, without bringing them to the foreground first.');
	// }

	/**
	 * An alternative to clickDesktop, that *attempts* to click on background windows. will likely fail :(
	 */
	public static async clickMessage(options: { position: Position; windowTitle: string; type: 'post' | 'send'; holdFor?: number }): Promise<void> {
		const holdFor = options.holdFor ?? 30;
		// We are hardcoding button to left implicitly via WM_LBUTTONDOWN/UP in C++.
		// If right/middle clicks are needed later, the C++ side would need adjustment.
		await clickMessageValidated(options.position.x, options.position.y, holdFor, options.windowTitle, options.type);
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
		await clickValidated(x, y, button, holdFor, windowTitle ?? '');
	}

	public static async getPosition(): Promise<Position> {
		const position = await getPositionValidated();

		if (!isPosition(position)) throwError('position was not an object: ', position);
		return position;
	}

	public static async hold(options: { button?: 'left' | 'right'; position?: Position }): Promise<void> {
		options.button ??= 'left';
		const x = options.position?.x ?? null;
		const y = options.position?.y ?? null;
		await holdValidated(x, y, options.button);
	}

	public static async release(options: { button?: 'left' | 'right'; position?: Position }): Promise<void> {
		options.button ??= 'left';
		const x = options.position?.x ?? null;
		const y = options.position?.y ?? null;
		await releaseValidated(x, y, options.button);
	}
}
