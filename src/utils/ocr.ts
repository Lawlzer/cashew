import type { Worker } from 'tesseract.js';
import { createWorker } from 'tesseract.js';

interface GetTextOptions {
	characterWhitelist?: string;
}

let cachedWorker: Worker | undefined;
let workerInitPromise: Promise<Worker> | undefined;

export class Ocr {
	public static async getText(imagePath: string, options?: GetTextOptions): Promise<string> {
		await this.ensureWorkerExists(options);

		const ret = await cachedWorker!.recognize(imagePath);
		return ret.data.text.trim();
	}

	private static async ensureWorkerExists(options?: GetTextOptions): Promise<void> {
		if (cachedWorker) {
			return;
		}

		if (!workerInitPromise) {
			workerInitPromise = createWorker('eng').then(async (worker) => {
				await worker.setParameters({
					tessedit_char_whitelist: options?.characterWhitelist ?? undefined,
					user_defined_dpi: '300',
				});
				cachedWorker = worker;
				return worker;
			});
		}

		await workerInitPromise;
	}
}
