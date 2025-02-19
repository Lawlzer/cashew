/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { ensureDirectoryExists, throwError } from '@lawlzer/utils';
import bindings from 'bindings';
import sharp from 'sharp';

import { Config } from './config';
import { isCorrectColour, type Position } from './misc';

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

	// eslint-disable-next-line @typescript-eslint/require-await
	public async getPixel(x: number, y: number): Promise<rgb> {
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

	/**
	 * Duplicate part of the image into a new Image --- Useful for debugging area snippets.
	 */
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

	// eslint-disable-next-line @typescript-eslint/require-await
	public async setPixelColour(x: number, y: number, colour: rgb): Promise<void> {
		if (x >= this.width || y >= this.height) throwError('Pixel coordinates out of bounds');

		const bytesPerPixel = 4; // Since we're using 32-bit RGBA values
		const startIdx = (y * this.width + x) * bytesPerPixel;

		this.image.writeUInt8(colour.r, startIdx + 2); // Skip alpha byte
		this.image.writeUInt8(colour.g, startIdx + 1);
		this.image.writeUInt8(colour.b, startIdx + 0);
	}

	/***
	 * Find all positions with a specific colour
	 */
	public async findPositionsWithColour(colour: rgb, maxOffset: number): Promise<Position[]> {
		const positions: Position[] = [];

		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				const currentPixel = await this.getPixel(x, y);
				if (isCorrectColour(currentPixel, colour, maxOffset)) positions.push({ x, y });
			}
		}
		return positions;
	}
}

export class Screen {
	public static async getSingleScreenPixel(x: number, y: number, windowTitle?: string): Promise<rgb> {
		const image = await this.initFromScreen(x, y, 1, 1, windowTitle);
		const pixel = await image.getPixel(0, 0);
		return pixel;
	}

	public static async initFromScreen(x: number, y: number, width: number, height: number, windowTitle?: string): Promise<Image> {
		const realWindowTitle = windowTitle ?? Config.getProcessConfig().windowTitle;
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

	private static async getScreen(x: number, y: number, width: number, height: number, windowTitle?: string): Promise<Buffer> {
		if (typeof x !== 'number') throwError(`x is not a number: ${x}`);
		if (typeof y !== 'number') throwError(`y is not a number: ${y}`);
		if (typeof width !== 'number') throwError(`width is not a number: ${width}`);
		if (typeof height !== 'number') throwError(`height is not a number: ${height}`);

		const realWindowTitle = windowTitle ?? Config.getProcessConfig().windowTitle;

		if (realWindowTitle !== '' && realWindowTitle !== undefined) {
			const result: Buffer = await screenAddon.getWindowPixels(realWindowTitle, x, y, width, height);
			if (!Buffer.isBuffer(result)) throwError('Result is not a buffer');
			return result;
		}

		const result: Buffer = await screenAddon.getScreenPixels(x, y, width, height);
		if (!Buffer.isBuffer(result)) throwError('Result is not a buffer -- this is certainly an issue with @lawlzer/cashew');
		return result;
	}
}
