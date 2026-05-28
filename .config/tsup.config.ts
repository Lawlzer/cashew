import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['cjs', 'esm'],
	dts: false,
	clean: false,
	sourcemap: true,
	minify: false,
	splitting: false,
	external: ['fs', 'path', 'os', 'crypto', 'graceful-fs', 'fs-extra', 'dotenv'],
	platform: 'node',
	target: 'node14',
});
