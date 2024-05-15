import { throwError } from '@lawlzer/utils';
import bindings from 'bindings';
const clipboardBinding = bindings('clipboard') ?? throwError('Could not load clipboard binding');

export class Clipboard {
	public static async write(text: string) {
		return clipboardBinding.WriteClipboard(text);
	}

	public static async read() {
		return clipboardBinding.ReadClipboard();
	}

	public static async paste() {
		return clipboardBinding.ClipboardPaste();
	}
}
