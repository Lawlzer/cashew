import type { Worker } from 'tesseract.js';
import { createWorker } from 'tesseract.js';

interface GetTextOptions {
	characterWhitelist?: string;
}

let cachedWorker: Worker;
export class Ocr {
	public static async getText(imagePath: string, options?: GetTextOptions): Promise<string> {
		await this.ensureWorkerExists(options);

		const ret = await cachedWorker!.recognize(imagePath);
		return ret.data.text.trim();
	}

	private static async ensureWorkerExists(options?: GetTextOptions): Promise<void> {
		if (cachedWorker != null) {
			cachedWorker = await createWorker('eng');
			await cachedWorker.setParameters({
				tessedit_char_whitelist: options?.characterWhitelist ?? undefined,
				user_defined_dpi: '300',
			});
		}
	}
}
