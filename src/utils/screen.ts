import { ensureDirectoryExists, throwError } from '@lawlzer/utils';
import bindings from 'bindings';
import sharp from 'sharp';
const screenAddon = bindings('screen');

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

async function getScreen(windowTitle: string, x: number, y: number, width: number, height: number): Promise<Buffer> {
	if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') throwError('Incorrect types passed in.');

	const result: Buffer = await screenAddon.getScreenPixels(windowTitle, x, y, width, height);
	if (!Buffer.isBuffer(result)) throwError('Result is not a buffer');

	return result;
}

export function allColoursUnder(colour: rgb, maxColour: number) {
	if (colour.r >= maxColour) return false;
	if (colour.g >= maxColour) return false;
	if (colour.b >= maxColour) return false;
	return true;
}

export function isCorrectColour(inputColour: rgb, expectedColour: rgb, maxOffset: number) {
	if (Math.abs(inputColour.r - expectedColour.r) >= maxOffset) return false;
	if (Math.abs(inputColour.g - expectedColour.g) >= maxOffset) return false;
	if (Math.abs(inputColour.b - expectedColour.b) >= maxOffset) return false;
	return true;
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

	public static async getSingleScreenPixel(windowTitle: string, x: number, y: number): Promise<rgb> {
		const image = await getScreen(windowTitle, x, y, 1, 1);
		const r = image.readUInt8(0);
		const g = image.readUInt8(1);
		const b = image.readUInt8(2);
		return { r, g, b };
	}

	public static async initFromScreen(windowTitle: string, x: number, y: number, width: number, height: number): Promise<Image> {
		const image = await getScreen(windowTitle, x, y, width, height);
		return new Image(image, width, height);
	}

	public static async initFromFile(path: string): Promise<Image> {
		const img = await sharp(path).raw().toBuffer({ resolveWithObject: true });

		const imgData = img.data;
		const width = img.info.width;
		const height = img.info.height;

		const buffer: Buffer = Buffer.from(imgData);
		return new Image(buffer, width, height);
	}

	public async getPixel(x: number, y: number): Promise<rgb> {
		if (x >= this.width || y >= this.height) throwError('Pixel coordinates out of bounds');

		const bytesPerPixel = 4; // Since we're using 32-bit RGBA values
		const startIdx = (y * this.width + x) * bytesPerPixel;

		// Assuming the highest byte is the alpha and we can ignore it for RGB
		const r = this.image.readUInt8(startIdx + 0);
		const g = this.image.readUInt8(startIdx + 1);
		const b = this.image.readUInt8(startIdx + 2);

		return { r, g, b };
	}

	public async saveToFile(path: string): Promise<void> {
		const output: number[] = [];
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				const currentPixel = await this.getPixel(x, y);
				output.push(currentPixel.r, currentPixel.g, currentPixel.b, 255);
			}
		}

		const buffer = Buffer.from(output);

		await ensureDirectoryExists(path);
		await sharp(buffer, {
			raw: {
				width: this.width,
				height: this.height,
				channels: 4,
			},
		}).toFile(path);
	}

	public async slice(x: number, y: number, width: number, height: number): Promise<Image> {
		const output: number[] = [];
		for (let j = y; j < y + height; j++) {
			for (let i = x; i < x + width; i++) {
				const currentPixel = await this.getPixel(i, j);
				output.push(currentPixel.r, currentPixel.g, currentPixel.b, 255);
			}
		}

		const buffer = Buffer.from(output);
		return new Image(buffer, width, height);
	}

	public async setPixel(x: number, y: number, colour: rgb): Promise<void> {
		if (x >= this.width || y >= this.height) throwError('Pixel coordinates out of bounds');

		const bytesPerPixel = 4; // Since we're using 32-bit RGBA values
		const startIdx = (y * this.width + x) * bytesPerPixel;

		this.image.writeUInt8(colour.r, startIdx + 2); // Skip alpha byte
		this.image.writeUInt8(colour.g, startIdx + 1);
		this.image.writeUInt8(colour.b, startIdx + 0);
	}
}

export async function getDifferences(image1: Image, image2: Image): Promise<{ image: Image; pixels: Pixel[] }> {
	if (image1.width !== image2.width || image1.height !== image2.height) throwError('Image dimensions do not match');

	const output: Pixel[] = [];

	for (let y = 0; y < image1.height; y++) {
		for (let x = 0; x < image1.width; x++) {
			const pixel1 = await image1.getPixel(x, y);
			const pixel2 = await image2.getPixel(x, y);

			if (pixel1.r !== pixel2.r || pixel1.g !== pixel2.g || pixel1.b !== pixel2.b) {
				output.push({ x, y, r: pixel1.r, g: pixel1.g, b: pixel1.b });
			}
		}
	}

	const buffer: number[] = [];
	for (const pixel of output) {
		buffer.push(pixel.r, pixel.g, pixel.b, 255);
	}

	const image = new Image(Buffer.from(buffer), image1.width, image1.height);
	return { image: image, pixels: output };
}

export async function devSaveRgbImage(image: rgb[][], path: string): Promise<void> {
	const width = image.length;
	const height = image[0].length;
	const output = [];

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixel = image[x][y];
			output.push(pixel.r, pixel.g, pixel.b, 255);
		}
	}

	const buffer = Buffer.from(output);

	await ensureDirectoryExists(path);

	await sharp(buffer, {
		raw: {
			width: width,
			height: height,
			channels: 4,
		},
	}).toFile(path);
}
