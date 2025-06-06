import { ensureDirectoryExists, throwError } from '@lawlzer/utils';

import { loadBinding, type ScreenBinding, screenSchema } from './bindingLoader';
import { Config } from './config';
import { isCorrectColour, type Position } from './misc';

// Lazy load sharp to avoid issues with Bun
const sharpModule: any = null;
let sharpLoadingPromise: Promise<any> | null = null;

async function getSharp(): Promise<any> {
	if (sharpModule) {
		return sharpModule;
	}

	// If already loading, wait for the existing load to complete
	if (sharpLoadingPromise) {
		return sharpLoadingPromise;
	}

	// Lazy load sharp to avoid bundling it for libraries that don't use screen features
	// Also allows the lib to work even if sharp installation fails (for non-screen usage)
	// Also significantly speeds up the import time
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	const dynamicImport = new Function('specifier', 'return import(specifier)');

	sharpLoadingPromise = (async () => {
		try {
			const loadedModule = await dynamicImport('sharp');
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return loadedModule.default || loadedModule;
		} catch (error) {
			throwError(`Failed to load sharp module. Please install it with: npm install sharp\n${String(error)}`);
		}
	})();

	return sharpLoadingPromise;
}

// Load the bindings with the new Valibot-based loader
const screenBinding = loadBinding<ScreenBinding>('screen', screenSchema);

export interface rgb {
	r: number;
	g: number;
	b: number;
}

export interface Pixel {
	x: number;
	y: number;
	r: number;
	g: number;
	b: number;
}

export interface Area {
	x: number;
	y: number;
	width: number;
	height: number;
}

export class Image {
	public readonly width: number;
	public readonly height: number;
	private readonly image: Buffer;

	public constructor(image: Buffer, width: number, height: number) {
		this.image = image;
		this.width = width;
		this.height = height;
	}

	public getPixel(x: number, y: number): rgb {
		if (x >= this.width || y >= this.height) throwError('Pixel coordinates out of bounds');

		const bytesPerPixel = 4; // Since we're using 32-bit RGBA values
		const startIdx = (y * this.width + x) * bytesPerPixel;

		// Assuming the highest byte is the alpha, we can ignore it for RGB
		const r = this.image.readUInt8(startIdx + 0);
		const g = this.image.readUInt8(startIdx + 1);
		const b = this.image.readUInt8(startIdx + 2);

		return { r, g, b };
	}

	public async saveToFile(path: string): Promise<void> {
		const output: number[] = [];
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				const currentPixel = this.getPixel(x, y);
				output.push(currentPixel.r, currentPixel.g, currentPixel.b, 255);
			}
		}

		const buffer = Buffer.from(output);

		await ensureDirectoryExists(path);
		const sharp = await getSharp();
		await sharp(buffer, {
			raw: {
				width: this.width,
				height: this.height,
				channels: 4,
			},
		}).toFile(path);
	}

	/**
	 * Duplicate part of the image into a new Image --- Useful for debugging area snippets.
	 */
	public slice(x: number, y: number, width: number, height: number): Image {
		const output: number[] = [];
		for (let j = y; j < y + height; j++) {
			for (let i = x; i < x + width; i++) {
				const currentPixel = this.getPixel(i, j);
				output.push(currentPixel.r, currentPixel.g, currentPixel.b, 255);
			}
		}

		const buffer = Buffer.from(output);
		return new Image(buffer, width, height);
	}

	public setPixelColour(x: number, y: number, colour: rgb): void {
		if (x >= this.width || y >= this.height) throwError('Pixel coordinates out of bounds');

		const bytesPerPixel = 4; // Since we're using 32-bit RGBA values
		const startIdx = (y * this.width + x) * bytesPerPixel;

		this.image.writeUInt8(colour.r, startIdx + 0);
		this.image.writeUInt8(colour.g, startIdx + 1);
		this.image.writeUInt8(colour.b, startIdx + 2);
	}

	/***
	 * Find all positions with a specific colour
	 */
	public findPositionsWithColour(colour: rgb, maxOffset: number): Position[] {
		const positions: Position[] = [];

		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				const currentPixel = this.getPixel(x, y);
				if (isCorrectColour(currentPixel, colour, maxOffset)) positions.push({ x, y });
			}
		}
		return positions;
	}

	/**
	 * Get all pixels as a flat array for performance-critical operations
	 */
	public getAllPixels(): rgb[] {
		const pixels: rgb[] = [];
		const bytesPerPixel = 4;
		const totalPixels = this.width * this.height;

		for (let i = 0; i < totalPixels; i++) {
			const startIdx = i * bytesPerPixel;
			pixels.push({
				r: this.image.readUInt8(startIdx + 0),
				g: this.image.readUInt8(startIdx + 1),
				b: this.image.readUInt8(startIdx + 2),
			});
		}

		return pixels;
	}
}

export class Screen {
	public static async getSingleScreenPixel(x: number, y: number, windowTitle?: string): Promise<rgb> {
		const image = await this.initFromScreen(x, y, 1, 1, windowTitle);
		return image.getPixel(0, 0);
	}

	public static async initFromScreen(x: number, y: number, width: number, height: number, windowTitle?: string): Promise<Image> {
		const realWindowTitle = windowTitle ?? Config.windowTitle;
		const image = await this.getScreen(x, y, width, height, realWindowTitle);
		return new Image(image, width, height);
	}

	public static async initFromFile(path: string): Promise<Image> {
		const sharp = await getSharp();
		const img = await sharp(path).raw().toBuffer({ resolveWithObject: true });

		const imgData = img.data;
		const { width } = img.info;
		const { height } = img.info;
		const buffer: Buffer = Buffer.from(imgData);
		return new Image(buffer, width, height);
	}

	private static async getScreen(x: number, y: number, width: number, height: number, windowTitle?: string): Promise<Buffer> {
		// Type validation is now handled by the binding loader
		const realWindowTitle = windowTitle ?? Config.windowTitle;

		if (realWindowTitle !== '' && realWindowTitle !== undefined) {
			return screenBinding.getWindowPixels(realWindowTitle, x, y, width, height);
		}

		return screenBinding.getScreenPixels(x, y, width, height);
	}
}
