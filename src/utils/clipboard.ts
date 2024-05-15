import { throwError } from '@lawlzer/utils';
import bindings from 'bindings';
const clipboardBinding = bindings('clipboard') ?? throwError('Could not load clipboard binding');

export class Clipboard {
	public static async write(text: string): Promise<void> {
		return clipboardBinding.WriteClipboard(text);
	}

	public static async read(): Promise<string> {
		return clipboardBinding.ReadClipboard() ?? '';
	}

	public static async paste(): Promise<void> {
		return clipboardBinding.ClipboardPaste();
	}
}
