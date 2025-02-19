import { throwError } from '@lawlzer/utils';
import bindings from 'bindings';
const clipboardBinding = bindings('clipboard') ?? throwError('Could not load clipboard binding');

export class Clipboard {
	public static async write(text: string): Promise<void> {
		const result = await clipboardBinding.WriteClipboard(text);
		if (typeof result !== 'undefined') throwError(`result is not undefined: ${result}`);
	}

	public static async read(): Promise<string> {
		const result = await clipboardBinding.ReadClipboard();
		if (typeof result !== 'string') throwError(`result is not a string: ${result}`);
		return result;
	}

	public static async paste(): Promise<void> {
		const result = await clipboardBinding.ClipboardPaste();
		if (typeof result !== 'undefined') throwError(`result is not undefined: ${result}`);
	}
}
