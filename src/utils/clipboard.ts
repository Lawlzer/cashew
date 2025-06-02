import { throwError } from '@lawlzer/utils';
import { loadBinding } from './bindingLoader';

const clipboardBinding = loadBinding('clipboard');

export class Clipboard {
	public static async write(text: string): Promise<void> {
		const result = await clipboardBinding.WriteClipboard(text);
		if (result !== undefined && result !== true) throwError(`Invalid result: ${result}`);
	}

	public static async read(): Promise<string> {
		const result = await clipboardBinding.ReadClipboard();
		if (typeof result !== 'string') throwError(`result is not a string: ${result}`);
		return result;
	}

	public static async paste(): Promise<void> {
		const result = await clipboardBinding.ClipboardPaste();
		if (result !== undefined && result !== true) throwError(`Invalid result: ${result}`);
	}
}
