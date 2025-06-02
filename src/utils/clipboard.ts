import { throwError } from '@lawlzer/utils';
import { loadTypedBinding, type BindingSchema, createValidatedFunction } from './bindingLoader';

interface ClipboardBinding {
	ReadClipboard: () => Promise<string | null>;
	WriteClipboard: (text: string) => Promise<boolean>;
	ClipboardPaste: () => Promise<boolean>;
}

// Define the schema for the clipboard binding
const clipboardBindingSchema: BindingSchema = {
	ReadClipboard: {
		type: 'function',
		params: [],
		returnType: 'string', // Note: can also return null, handled in validator
	},
	WriteClipboard: {
		type: 'function',
		params: [{ name: 'text', type: 'string' }],
		returnType: 'boolean',
	},
	ClipboardPaste: {
		type: 'function',
		params: [],
		returnType: 'boolean',
	},
};

// Custom validator for ClipboardBinding
function isClipboardBinding(binding: unknown): binding is ClipboardBinding {
	return typeof binding === 'object' && binding !== null && 'ReadClipboard' in binding && 'WriteClipboard' in binding && 'ClipboardPaste' in binding && typeof (binding as any).ReadClipboard === 'function' && typeof (binding as any).WriteClipboard === 'function' && typeof (binding as any).ClipboardPaste === 'function';
}

// Load the binding with proper typing and validation
const clipboardBinding = loadTypedBinding<ClipboardBinding>('clipboard', clipboardBindingSchema, isClipboardBinding);

// Create validated wrapper functions with runtime type checking
const readClipboardValidated = createValidatedFunction(clipboardBinding.ReadClipboard, 'ReadClipboard', 'string', (value): value is string | null => typeof value === 'string' || value === null);

const writeClipboardValidated = createValidatedFunction(clipboardBinding.WriteClipboard, 'WriteClipboard', 'boolean');

const clipboardPasteValidated = createValidatedFunction(clipboardBinding.ClipboardPaste, 'ClipboardPaste', 'boolean');

export class Clipboard {
	public static async write(text: string): Promise<void> {
		const result = await writeClipboardValidated(text);
		if (!result) throwError(`Invalid result: ${result}`);
	}

	public static async read(): Promise<string> {
		const result = await readClipboardValidated();
		if (result === null) throwError('Failed to read clipboard');
		return result;
	}

	public static async paste(): Promise<void> {
		const result = await clipboardPasteValidated();
		if (!result) throwError(`Invalid result: ${result}`);
	}
}
