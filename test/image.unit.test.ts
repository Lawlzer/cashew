import type { rgb } from '../src/utils/screen';
import { Image } from '../src/utils/screen';

// Helper: create a buffer for an image with given pixels
// Format: RGBA, 4 bytes per pixel
function createImageBuffer(width: number, height: number, pixels: rgb[]): Buffer {
	const buf = Buffer.alloc(width * height * 4);
	for (let i = 0; i < pixels.length; i++) {
		const offset = i * 4;
		buf.writeUInt8(pixels[i].r, offset + 0);
		buf.writeUInt8(pixels[i].g, offset + 1);
		buf.writeUInt8(pixels[i].b, offset + 2);
		buf.writeUInt8(255, offset + 3); // alpha
	}
	return buf;
}

function createSolidImage(width: number, height: number, color: rgb): Image {
	const pixels = Array.from({ length: width * height }, () => color);
	return new Image(createImageBuffer(width, height, pixels), width, height);
}

describe('Image', () => {
	describe('constructor', () => {
		test('sets width and height', () => {
			const img = createSolidImage(10, 20, { r: 0, g: 0, b: 0 });
			expect(img.width).toBe(10);
			expect(img.height).toBe(20);
		});
	});

	describe('getPixel', () => {
		test('returns correct pixel color at (0,0)', () => {
			const pixels: rgb[] = [
				{ r: 255, g: 0, b: 0 },
				{ r: 0, g: 255, b: 0 },
				{ r: 0, g: 0, b: 255 },
				{ r: 128, g: 128, b: 128 },
			];
			const img = new Image(createImageBuffer(2, 2, pixels), 2, 2);

			expect(img.getPixel(0, 0)).toEqual({ r: 255, g: 0, b: 0 });
		});

		test('returns correct pixel color at various positions', () => {
			const pixels: rgb[] = [
				{ r: 10, g: 20, b: 30 },
				{ r: 40, g: 50, b: 60 },
				{ r: 70, g: 80, b: 90 },
				{ r: 100, g: 110, b: 120 },
				{ r: 130, g: 140, b: 150 },
				{ r: 160, g: 170, b: 180 },
			];
			const img = new Image(createImageBuffer(3, 2, pixels), 3, 2);

			expect(img.getPixel(0, 0)).toEqual({ r: 10, g: 20, b: 30 });
			expect(img.getPixel(1, 0)).toEqual({ r: 40, g: 50, b: 60 });
			expect(img.getPixel(2, 0)).toEqual({ r: 70, g: 80, b: 90 });
			expect(img.getPixel(0, 1)).toEqual({ r: 100, g: 110, b: 120 });
			expect(img.getPixel(1, 1)).toEqual({ r: 130, g: 140, b: 150 });
			expect(img.getPixel(2, 1)).toEqual({ r: 160, g: 170, b: 180 });
		});

		test('throws for out-of-bounds x coordinate', () => {
			const img = createSolidImage(2, 2, { r: 0, g: 0, b: 0 });
			expect(() => img.getPixel(2, 0)).toThrow();
		});

		test('throws for out-of-bounds y coordinate', () => {
			const img = createSolidImage(2, 2, { r: 0, g: 0, b: 0 });
			expect(() => img.getPixel(0, 2)).toThrow();
		});
	});

	describe('setPixelColour', () => {
		test('modifies pixel at specified position', () => {
			const img = createSolidImage(3, 3, { r: 0, g: 0, b: 0 });
			img.setPixelColour(1, 1, { r: 255, g: 128, b: 64 });
			expect(img.getPixel(1, 1)).toEqual({ r: 255, g: 128, b: 64 });
		});

		test('does not affect neighboring pixels', () => {
			const img = createSolidImage(3, 3, { r: 0, g: 0, b: 0 });
			img.setPixelColour(1, 1, { r: 255, g: 255, b: 255 });

			expect(img.getPixel(0, 0)).toEqual({ r: 0, g: 0, b: 0 });
			expect(img.getPixel(2, 2)).toEqual({ r: 0, g: 0, b: 0 });
			expect(img.getPixel(0, 1)).toEqual({ r: 0, g: 0, b: 0 });
			expect(img.getPixel(1, 0)).toEqual({ r: 0, g: 0, b: 0 });
		});

		test('throws for out-of-bounds coordinates', () => {
			const img = createSolidImage(2, 2, { r: 0, g: 0, b: 0 });
			expect(() => img.setPixelColour(2, 0, { r: 255, g: 0, b: 0 })).toThrow();
			expect(() => img.setPixelColour(0, 2, { r: 255, g: 0, b: 0 })).toThrow();
		});
	});

	describe('slice', () => {
		test('extracts a sub-region of the image', () => {
			// Create a 4x4 image with unique pixels
			const pixels: rgb[] = [];
			for (let y = 0; y < 4; y++) {
				for (let x = 0; x < 4; x++) {
					pixels.push({ r: x * 10, g: y * 10, b: (x + y) * 5 });
				}
			}
			const img = new Image(createImageBuffer(4, 4, pixels), 4, 4);

			// Slice a 2x2 region starting at (1,1)
			const sliced = img.slice(1, 1, 2, 2);
			expect(sliced.width).toBe(2);
			expect(sliced.height).toBe(2);

			// The pixel at (1,1) in the original should be at (0,0) in the slice
			expect(sliced.getPixel(0, 0)).toEqual({ r: 10, g: 10, b: 10 });
			// (2,1) -> (1,0) in slice
			expect(sliced.getPixel(1, 0)).toEqual({ r: 20, g: 10, b: 15 });
			// (1,2) -> (0,1) in slice
			expect(sliced.getPixel(0, 1)).toEqual({ r: 10, g: 20, b: 15 });
			// (2,2) -> (1,1) in slice
			expect(sliced.getPixel(1, 1)).toEqual({ r: 20, g: 20, b: 20 });
		});

		test('full image slice returns equivalent image', () => {
			const img = createSolidImage(3, 3, { r: 42, g: 84, b: 126 });
			const sliced = img.slice(0, 0, 3, 3);

			expect(sliced.width).toBe(3);
			expect(sliced.height).toBe(3);
			for (let y = 0; y < 3; y++) {
				for (let x = 0; x < 3; x++) {
					expect(sliced.getPixel(x, y)).toEqual({ r: 42, g: 84, b: 126 });
				}
			}
		});

		test('single pixel slice', () => {
			const pixels: rgb[] = [
				{ r: 10, g: 20, b: 30 },
				{ r: 40, g: 50, b: 60 },
				{ r: 70, g: 80, b: 90 },
				{ r: 100, g: 110, b: 120 },
			];
			const img = new Image(createImageBuffer(2, 2, pixels), 2, 2);

			const sliced = img.slice(1, 1, 1, 1);
			expect(sliced.width).toBe(1);
			expect(sliced.height).toBe(1);
			expect(sliced.getPixel(0, 0)).toEqual({ r: 100, g: 110, b: 120 });
		});
	});

	describe('findPositionsWithColour', () => {
		test('finds all matching positions with exact color', () => {
			const pixels: rgb[] = [
				{ r: 255, g: 0, b: 0 },
				{ r: 0, g: 255, b: 0 },
				{ r: 0, g: 255, b: 0 },
				{ r: 255, g: 0, b: 0 },
			];
			const img = new Image(createImageBuffer(2, 2, pixels), 2, 2);

			const positions = img.findPositionsWithColour({ r: 255, g: 0, b: 0 }, 0);
			expect(positions).toEqual([
				{ x: 0, y: 0 },
				{ x: 1, y: 1 },
			]);
		});

		test('finds positions within offset tolerance', () => {
			const pixels: rgb[] = [
				{ r: 100, g: 100, b: 100 },
				{ r: 105, g: 105, b: 105 },
				{ r: 200, g: 200, b: 200 },
				{ r: 95, g: 95, b: 95 },
			];
			const img = new Image(createImageBuffer(2, 2, pixels), 2, 2);

			const positions = img.findPositionsWithColour({ r: 100, g: 100, b: 100 }, 5);
			expect(positions).toEqual([
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 },
			]);
		});

		test('returns empty array when no match', () => {
			const img = createSolidImage(3, 3, { r: 0, g: 0, b: 0 });
			const positions = img.findPositionsWithColour({ r: 255, g: 255, b: 255 }, 0);
			expect(positions).toEqual([]);
		});

		test('returns all positions for solid color image', () => {
			const img = createSolidImage(2, 2, { r: 50, g: 100, b: 150 });
			const positions = img.findPositionsWithColour({ r: 50, g: 100, b: 150 }, 0);
			expect(positions).toHaveLength(4);
		});
	});

	describe('getAllPixels', () => {
		test('returns all pixels in order', () => {
			const pixels: rgb[] = [
				{ r: 10, g: 20, b: 30 },
				{ r: 40, g: 50, b: 60 },
				{ r: 70, g: 80, b: 90 },
				{ r: 100, g: 110, b: 120 },
			];
			const img = new Image(createImageBuffer(2, 2, pixels), 2, 2);

			const allPixels = img.getAllPixels();
			expect(allPixels).toHaveLength(4);
			expect(allPixels[0]).toEqual({ r: 10, g: 20, b: 30 });
			expect(allPixels[1]).toEqual({ r: 40, g: 50, b: 60 });
			expect(allPixels[2]).toEqual({ r: 70, g: 80, b: 90 });
			expect(allPixels[3]).toEqual({ r: 100, g: 110, b: 120 });
		});

		test('returns empty array for 0-dimension image', () => {
			const img = new Image(Buffer.alloc(0), 0, 0);
			expect(img.getAllPixels()).toEqual([]);
		});

		test('pixel count matches width * height', () => {
			const img = createSolidImage(5, 3, { r: 0, g: 0, b: 0 });
			expect(img.getAllPixels()).toHaveLength(15);
		});
	});
});
