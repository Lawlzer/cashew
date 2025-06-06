import esbuild from 'esbuild';
import { promises as fs } from 'fs';
import * as pathModule from 'path';

async function build(name: string, options: esbuild.BuildOptions, logOverride?: Record<string, esbuild.LogLevel>): Promise<esbuild.BuildResult> {
	const filePath = `${name}.js`;
	console.info(`Building ${name}...`);

	const buildOptions: esbuild.BuildOptions = {
		outfile: `./dist/${filePath}`,
		bundle: true,
		...options,
		logOverride,
	};

	if (process.argv.includes('--watch')) {
		const ctx = await esbuild.context({
			...buildOptions,
			logLevel: 'info',
			sourcemap: true,
			minify: false,
		});
		await ctx.watch();
		// Return a dummy BuildResult for watch mode since the actual build happens continuously
		return {
			errors: [],
			warnings: [],
			outputFiles: [],
			metafile: undefined,
			mangleCache: undefined,
		} as esbuild.BuildResult;
	} else {
		return esbuild.build(buildOptions);
	}
}

async function copyNativeBindings(): Promise<void> {
	console.info('Copying native bindings...');

	const sourceDir = pathModule.join(process.cwd(), 'build', 'Release');
	const destDir = pathModule.join(process.cwd(), 'dist', 'build', 'Release');

	// Ensure destination directory exists
	await fs.mkdir(destDir, { recursive: true });

	// Copy all .node files
	const nodeFiles = ['clipboard.node', 'screen.node', 'keyboard.node', 'mouse.node', 'misc.node', 'screenRaw.node', 'panicShutdown.node'];

	for (const nodeFile of nodeFiles) {
		const sourcePath = pathModule.join(sourceDir, nodeFile);
		const destPath = pathModule.join(destDir, nodeFile);

		try {
			await fs.access(sourcePath);
			await fs.copyFile(sourcePath, destPath);
			console.info(`Copied ${nodeFile} to dist/build/Release/`);
		} catch (error) {
			console.warn(`Warning: ${nodeFile} not found at ${sourcePath}`);
		}
	}
}

async function buildAll(): Promise<esbuild.BuildResult[]> {
	const externalPackages = ['fs', 'path', 'os', 'crypto', 'graceful-fs', 'fs-extra', 'dotenv'];
	const results = await Promise.all([
		build('index', {
			entryPoints: ['src/index.js'],
			platform: 'node',
			minify: true,
			target: ['es6'],
			external: externalPackages,
			format: 'esm',
		}),
		build('esm', {
			entryPoints: ['src/index.js'],
			platform: 'node',
			external: externalPackages,
			format: 'esm',
		}),
		build(
			'cjs',
			{
				entryPoints: ['src/index.js'],
				target: ['node10.4'],
				platform: 'node',
				external: externalPackages,
				format: 'cjs',
			},
			{ 'empty-import-meta': 'silent' }
		),
	]);

	// Copy native bindings after JS build completes
	await copyNativeBindings();

	return results;
}

buildAll()
	.then(() => {
		console.info('Build completed successfully');
	})
	.catch((error) => {
		console.error('Build failed:', error);
		process.exit(1);
	});
