import { throwError } from '@lawlzer/utils';

import { type ClipboardBinding, loadBinding } from './bindingLoader';

const clipboardBinding = loadBinding<ClipboardBinding>('clipboard');

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
