import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Build System', () => {
	beforeAll(async () => {
		// Compile build scripts
		await execAsync('npx tsc build-parallel.ts --outDir . --module esnext --target es2020 --moduleResolution node');

		// Ensure we start with a clean state
		await execAsync('npm run clean');
	}, 30000);

	describe('Parallel Build', () => {
		test('should complete clean build successfully', async () => {
			const startTime = Date.now();
			const { stdout, stderr } = await execAsync('npm run build:clean');
			const duration = (Date.now() - startTime) / 1000;

			expect(stdout).toContain('Build completed successfully');
			expect(stderr).toBe('');
			expect(duration).toBeLessThan(90);
		}, 120000);

		test('should create all expected output files', async () => {
			const expectedFiles = ['dist/index.js', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.d.ts.map', 'dist/build/Release/cashew.node'];

			for (const file of expectedFiles) {
				const exists = await fs
					.access(file)
					.then(() => true)
					.catch(() => false);
				expect(exists).toBe(true);
			}
		});

		test('should use cache on incremental builds', async () => {
			const startTime = Date.now();
			const { stdout } = await execAsync('npm run build');
			const duration = (Date.now() - startTime) / 1000;

			expect(stdout).toContain('Rust build cache is valid');
			expect(stdout).toContain('Build completed successfully');
			expect(duration).toBeLessThan(10);
		}, 20000);
	});

	describe('Build Output', () => {
		test('should generate valid TypeScript declarations', async () => {
			const indexDeclaration = await fs.readFile('dist/index.d.ts', 'utf-8');
			const keyboardDeclaration = await fs.readFile('dist/utils/keyboard.d.ts', 'utf-8');
			const mouseDeclaration = await fs.readFile('dist/utils/mouse.d.ts', 'utf-8');
			const screenDeclaration = await fs.readFile('dist/utils/screen.d.ts', 'utf-8');
			const clipboardDeclaration = await fs.readFile('dist/utils/clipboard.d.ts', 'utf-8');

			// Check for expected class declarations
			expect(keyboardDeclaration).toContain('declare class Keyboard');
			expect(mouseDeclaration).toContain('declare class Mouse');
			expect(screenDeclaration).toContain('declare class Screen');
			expect(clipboardDeclaration).toContain('declare class Clipboard');

			// Check for static methods
			expect(keyboardDeclaration).toContain('static onKeypress');
			expect(keyboardDeclaration).toContain('static getAllKeypresses');
			expect(keyboardDeclaration).toContain('static stopAllKeyboardListeners');

			// Check for exports
			expect(indexDeclaration).toContain("export * from './utils/keyboard'");
		});

		test('should generate both ESM and CJS outputs', async () => {
			const esmContent = await fs.readFile('dist/index.js', 'utf-8');
			const cjsContent = await fs.readFile('dist/index.cjs', 'utf-8');

			// ESM should have export statements
			expect(esmContent).toContain('export');

			// CJS should have module.exports
			expect(cjsContent).toContain('exports');
		});

		test('should copy the native binding', async () => {
			const nativeDir = 'dist/build/Release';
			const files = await fs.readdir(nativeDir);
			const nodeFiles = files.filter((f) => f.endsWith('.node'));

			expect(nodeFiles).toEqual(['cashew.node']);
		});
	});

	describe('Build Commands', () => {
		test('legacy build should still work', async () => {
			await execAsync('npm run clean');
			const { stdout, stderr } = await execAsync('npm run build:legacy');

			expect(stdout).not.toContain('error');
			expect(stderr).not.toContain('error');

			// Verify files were created
			const indexExists = await fs
				.access('dist/index.js')
				.then(() => true)
				.catch(() => false);
			expect(indexExists).toBe(true);
		}, 120000);

		test('individual build steps should work', async () => {
			// Test types build
			const { stdout: typesOut } = await execAsync('npm run build:types');
			expect(typesOut).not.toContain('error');

			// Test JS build
			const { stdout: jsOut } = await execAsync('npm run build:js');
			expect(jsOut).not.toContain('error');
		}, 20000);
	});

	afterAll(async () => {
		// Clean up generated files
		await execAsync('npm run clean:generated').catch(() => {});
	});
});
