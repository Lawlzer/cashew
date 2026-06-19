import type { Position } from '../src/utils/misc';
import { getAreaOfPositions, getForegroundWindowTitle, isCorrectColour, randomBellCurve } from '../src/utils/misc';
import type { rgb } from '../src/utils/screen';

interface MiscBindingOverride {
	SetForegroundWindow: (windowTitle: string) => Promise<boolean>;
	GetForegroundWindowTitle: () => Promise<string | null>;
}

type GlobalWithMiscBindingOverride = typeof globalThis & {
	__cashewMiscBindingOverride?: MiscBindingOverride;
};

const globalWithMiscBindingOverride = globalThis as GlobalWithMiscBindingOverride;

function withMiscBindingOverride(binding: MiscBindingOverride): void {
	globalWithMiscBindingOverride.__cashewMiscBindingOverride = binding;
}

const originalConsoleWarn = console.warn;

afterEach(() => {
	delete globalWithMiscBindingOverride.__cashewMiscBindingOverride;
	console.warn = originalConsoleWarn;
});

describe('isCorrectColour', () => {
	test('returns true for identical colours with zero offset', () => {
		const pixel1: rgb = { r: 100, g: 150, b: 200 };
		const pixel2: rgb = { r: 100, g: 150, b: 200 };
		expect(isCorrectColour(pixel1, pixel2, 0)).toBe(true);
	});

	test('returns true when within offset', () => {
		const pixel1: rgb = { r: 100, g: 150, b: 200 };
		const pixel2: rgb = { r: 105, g: 145, b: 195 };
		expect(isCorrectColour(pixel1, pixel2, 5)).toBe(true);
	});

	test('returns true when exactly at offset boundary', () => {
		const pixel1: rgb = { r: 100, g: 150, b: 200 };
		const pixel2: rgb = { r: 110, g: 160, b: 210 };
		expect(isCorrectColour(pixel1, pixel2, 10)).toBe(true);
	});

	test('returns false when one channel exceeds offset', () => {
		const pixel1: rgb = { r: 100, g: 150, b: 200 };
		const pixel2: rgb = { r: 100, g: 150, b: 211 };
		expect(isCorrectColour(pixel1, pixel2, 10)).toBe(false);
	});

	test('returns false when all channels exceed offset', () => {
		const pixel1: rgb = { r: 0, g: 0, b: 0 };
		const pixel2: rgb = { r: 255, g: 255, b: 255 };
		expect(isCorrectColour(pixel1, pixel2, 10)).toBe(false);
	});

	test('handles zero-value colours', () => {
		const pixel1: rgb = { r: 0, g: 0, b: 0 };
		const pixel2: rgb = { r: 0, g: 0, b: 0 };
		expect(isCorrectColour(pixel1, pixel2, 0)).toBe(true);
	});

	test('handles max-value colours', () => {
		const pixel1: rgb = { r: 255, g: 255, b: 255 };
		const pixel2: rgb = { r: 255, g: 255, b: 255 };
		expect(isCorrectColour(pixel1, pixel2, 0)).toBe(true);
	});

	test('handles asymmetric offsets (pixel1 > pixel2)', () => {
		const pixel1: rgb = { r: 200, g: 200, b: 200 };
		const pixel2: rgb = { r: 190, g: 190, b: 190 };
		expect(isCorrectColour(pixel1, pixel2, 10)).toBe(true);
	});
});

describe('getAreaOfPositions', () => {
	test('returns correct area for single position', () => {
		const positions: Position[] = [{ x: 10, y: 20 }];
		const result = getAreaOfPositions(positions);
		expect(result).toEqual({ x: 10, y: 20, width: 0, height: 0 });
	});

	test('returns correct area for two positions', () => {
		const positions: Position[] = [
			{ x: 10, y: 20 },
			{ x: 50, y: 80 },
		];
		const result = getAreaOfPositions(positions);
		expect(result).toEqual({ x: 10, y: 20, width: 40, height: 60 });
	});

	test('returns correct area for multiple scattered positions', () => {
		const positions: Position[] = [
			{ x: 30, y: 50 },
			{ x: 10, y: 80 },
			{ x: 70, y: 20 },
			{ x: 50, y: 40 },
		];
		const result = getAreaOfPositions(positions);
		// x: min=10, max=70 => width=60; y: min=20, max=80 => height=60
		expect(result).toEqual({ x: 10, y: 20, width: 60, height: 60 });
	});

	test('handles positions at origin', () => {
		const positions: Position[] = [
			{ x: 0, y: 0 },
			{ x: 100, y: 100 },
		];
		const result = getAreaOfPositions(positions);
		expect(result).toEqual({ x: 0, y: 0, width: 100, height: 100 });
	});

	test('handles collinear horizontal positions', () => {
		const positions: Position[] = [
			{ x: 5, y: 10 },
			{ x: 15, y: 10 },
			{ x: 25, y: 10 },
		];
		const result = getAreaOfPositions(positions);
		expect(result).toEqual({ x: 5, y: 10, width: 20, height: 0 });
	});

	test('handles collinear vertical positions', () => {
		const positions: Position[] = [
			{ x: 10, y: 5 },
			{ x: 10, y: 15 },
			{ x: 10, y: 25 },
		];
		const result = getAreaOfPositions(positions);
		expect(result).toEqual({ x: 10, y: 5, width: 0, height: 20 });
	});
});

describe('randomBellCurve', () => {
	test('returns value within range', () => {
		for (let i = 0; i < 100; i++) {
			const result = randomBellCurve(10, 20);
			expect(result).toBeGreaterThanOrEqual(10);
			expect(result).toBeLessThan(20);
		}
	});

	test('returns value within range with 1 iteration (uniform)', () => {
		for (let i = 0; i < 100; i++) {
			const result = randomBellCurve(0, 100, 1);
			expect(result).toBeGreaterThanOrEqual(0);
			expect(result).toBeLessThan(100);
		}
	});

	test('returns min when range is 1', () => {
		const result = randomBellCurve(5, 6);
		expect(result).toBe(5);
	});

	test('returns min when min equals max', () => {
		const result = randomBellCurve(5, 5);
		expect(result).toBe(5);
	});

	test('bell curve distribution clusters around the middle', () => {
		// With enough samples and high iterations, values should cluster near center
		const samples = 1000;
		const min = 0;
		const max = 100;
		let sum = 0;

		for (let i = 0; i < samples; i++) {
			sum += randomBellCurve(min, max, 10);
		}

		const average = sum / samples;
		// With a bell curve, the average should be close to the midpoint
		expect(average).toBeGreaterThan(35);
		expect(average).toBeLessThan(65);
	});
});

describe('getForegroundWindowTitle', () => {
	test('returns binding result without warning when title lookup succeeds', async () => {
		const warnCalls: unknown[][] = [];
		console.warn = (...args: unknown[]) => {
			warnCalls.push(args);
		};

		withMiscBindingOverride({
			SetForegroundWindow: async () => true,
			GetForegroundWindowTitle: async () => 'Path of Exile 2',
		});

		await expect(getForegroundWindowTitle()).resolves.toBe('Path of Exile 2');
		expect(warnCalls).toEqual([]);
	});

	test('returns empty string and warns when binding returns null', async () => {
		const warnCalls: unknown[][] = [];
		console.warn = (...args: unknown[]) => {
			warnCalls.push(args);
		};

		withMiscBindingOverride({
			SetForegroundWindow: async () => true,
			GetForegroundWindowTitle: async () => null,
		});

		await expect(getForegroundWindowTitle()).resolves.toBe('');
		expect(warnCalls).toEqual([['Failed to get foreground window title']]);
	});

	test('returns empty string and warns when binding rejects', async () => {
		const warnCalls: unknown[][] = [];
		const error = new Error('misc.GetForegroundWindowTitle failed: Failed to get foreground window title');
		console.warn = (...args: unknown[]) => {
			warnCalls.push(args);
		};

		withMiscBindingOverride({
			SetForegroundWindow: async () => true,
			GetForegroundWindowTitle: async () => {
				throw error;
			},
		});

		await expect(getForegroundWindowTitle()).resolves.toBe('');
		expect(warnCalls).toEqual([['Failed to get foreground window title', error]]);
	});
});
