import { throwError } from '@lawlzer/utils';
import { loadBinding, clipboardSchema, type ClipboardBinding } from './bindingLoader';

// Load the binding with the new Valibot-based loader
const clipboardBinding = loadBinding<ClipboardBinding>('clipboard', clipboardSchema);

export class Clipboard {
	public static async write(text: string): Promise<void> {
		const result = await clipboardBinding.WriteClipboard(text);
		if (!result) throwError(`Invalid result: ${result}`);
	}

	public static async read(): Promise<string> {
		const result = await clipboardBinding.ReadClipboard();
		if (result === null) throwError('Failed to read clipboard');
		return result;
	}

	public static async paste(): Promise<void> {
		const result = await clipboardBinding.ClipboardPaste();
		if (!result) throwError(`Invalid result: ${result}`);
	}
}
