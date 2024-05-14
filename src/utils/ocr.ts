import type { Worker} from 'tesseract.js';
import { createWorker } from 'tesseract.js';

interface GetTextOptions {
	characterWhitelist?: string;
}

let cachedWorker: Worker | null = null;

export async function getText(imagePath: string, options?: GetTextOptions): Promise<string> {
	if (!cachedWorker) {
		cachedWorker = await createWorker('eng');
		await cachedWorker.setParameters({
			tessedit_char_whitelist: options?.characterWhitelist ?? undefined,
			user_defined_dpi: '300',
		});
	}

	const ret = await cachedWorker.recognize(imagePath);

	return ret.data.text.trim();
}
