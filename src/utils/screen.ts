import { ensureDirectoryExists, throwError } from '@lawlzer/utils';
import bindings from 'bindings';
import sharp from 'sharp';

import { Config } from './config';

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

export class Image {
	public readonly width: number;
	public readonly height: number;
	private readonly image: Buffer;

	public constructor(image: Buffer, width: number, height: number) {
		this.image = image;
		this.width = width;
		this.height = height;
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

	public async writeToFile(path: string): Promise<void> {
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

export class Screen {
	public static async getSingleScreenPixel(x: number, y: number, windowTitle?: string): Promise<rgb> {
		const image = await this.initFromScreen(x, y, 1, 1, windowTitle);
		const pixel = await image.getPixel(0, 0);
		return pixel;
	}

	public static async initFromScreen(x: number, y: number, width: number, height: number, windowTitle?: string): Promise<Image> {
		const realWindowTitle = windowTitle ?? Config.getProcessConfig().windowTitle ?? throwError(`initFromScreen requires a windowTitle - Either from setProcessConfig, or from the function args itself.`);
		const image = await this.getScreen(x, y, width, height, realWindowTitle);
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

	private static async getScreen(x: number, y: number, width: number, height: number, windowTitle: string): Promise<Buffer> {
		if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') throwError('Incorrect types passed in.');

		const realWindowTitle = windowTitle ?? Config.getProcessConfig().windowTitle ?? throwError(`getScreen requires a windowTitle - Either from setProcessConfig, or from the function args itself.`);
		const result: Buffer = await screenAddon.getScreenPixels(realWindowTitle, x, y, width, height);
		if (!Buffer.isBuffer(result)) throwError('Result is not a buffer');

		return result;
	}
}
