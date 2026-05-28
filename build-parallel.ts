import { exec } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
};

class BuildTimer {
	private readonly startTime = Date.now();
	private readonly taskName: string;

	public constructor(taskName: string) {
		this.taskName = taskName;
		console.info(`${colors.blue}Starting: ${taskName}${colors.reset}`);
	}

	public end(success = true): number {
		const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
		const color = success ? colors.green : colors.red;
		console.info(`${color}${this.taskName} completed in ${duration}s${colors.reset}`);
		return parseFloat(duration);
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function ensureDir(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true });
}

async function getFileStats(filePath: string): Promise<{ exists: boolean; mtime?: number; size?: number }> {
	try {
		const stat = await fs.stat(filePath);
		return { exists: true, mtime: stat.mtimeMs, size: stat.size };
	} catch {
		return { exists: false };
	}
}

async function collectFiles(dirPath: string, extension: string): Promise<string[]> {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const entryPath = path.join(dirPath, entry.name);
			if (entry.isDirectory()) return collectFiles(entryPath, extension);
			return entry.name.endsWith(extension) ? [entryPath] : [];
		})
	);

	return nested.flat();
}

async function runCommand(command: string, description: string, options?: { env?: Record<string, string> }): Promise<void> {
	const timer = new BuildTimer(description);
	try {
		const { stderr } = await execAsync(command, {
			env: { ...process.env, ...options?.env },
			maxBuffer: 10 * 1024 * 1024,
		});

		if (stderr && !stderr.includes('Finished')) {
			console.warn(`${colors.yellow}${description} warnings:${colors.reset}`);
			console.warn(stderr.trim());
		}

		timer.end(true);
	} catch (error) {
		timer.end(false);
		console.error(`${colors.red}${description} failed:${colors.reset}`);
		if (error instanceof Error) console.error(error.message);
		throw error;
	}
}

async function copyNativeBindings(): Promise<void> {
	const timer = new BuildTimer('Copy native binding');
	try {
		const sourceDir = path.join(process.cwd(), 'build', 'Release');
		const destDir = path.join(process.cwd(), 'dist', 'build', 'Release');
		await ensureDir(destDir);

		const sourcePath = path.join(sourceDir, 'cashew.node');
		if (!(await fileExists(sourcePath))) {
			throw new Error('Missing build/Release/cashew.node. Run npm run build:native first.');
		}

		const destPath = path.join(destDir, 'cashew.node');
		const [sourceStats, destStats] = await Promise.all([getFileStats(sourcePath), getFileStats(destPath)]);
		if (!destStats.exists || (sourceStats.mtime !== undefined && destStats.mtime !== undefined && sourceStats.mtime > destStats.mtime)) {
			await fs.copyFile(sourcePath, destPath);
			console.info(`  ${colors.cyan}Updated cashew.node${colors.reset}`);
		} else {
			console.info(`  ${colors.cyan}cashew.node is up to date${colors.reset}`);
		}

		timer.end(true);
	} catch (error) {
		timer.end(false);
		throw error;
	}
}

async function rustSourceFiles(): Promise<string[]> {
	const nativeFiles = (await fileExists('native/src')) ? await collectFiles('native/src', '.rs') : [];
	return ['Cargo.toml', 'build.rs', ...nativeFiles];
}

async function checkRustBuildCache(): Promise<boolean> {
	const nativePath = path.join('build', 'Release', 'cashew.node');
	const nativeStats = await getFileStats(nativePath);
	if (!nativeStats.exists || nativeStats.mtime === undefined) {
		console.info(`  ${colors.yellow}Native binding missing, rebuild needed${colors.reset}`);
		return false;
	}

	const sourceStats = await Promise.all((await rustSourceFiles()).map(async (file) => getFileStats(file)));
	const newestSource = sourceStats.reduce((latest, stat) => Math.max(latest, stat.mtime ?? 0), 0);
	const valid = nativeStats.mtime >= newestSource;
	if (valid) {
		console.info(`  ${colors.green}Rust build cache is valid, skipping rebuild${colors.reset}`);
	} else {
		console.info(`  ${colors.yellow}Rust sources changed, rebuild needed${colors.reset}`);
	}

	return valid;
}

async function showBuildSizes(): Promise<void> {
	console.info(`\n${colors.cyan}Build output sizes:${colors.reset}`);

	try {
		const distFiles = await fs.readdir('dist');
		const jsFiles = distFiles.filter((file) => file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.d.ts'));
		let totalJsSize = 0;

		for (const file of jsFiles) {
			const stat = await fs.stat(path.join('dist', file));
			totalJsSize += stat.size;
			console.info(`  ${file}: ${(stat.size / 1024).toFixed(1)} KB`);
		}

		const nativeStats = await getFileStats(path.join('dist', 'build', 'Release', 'cashew.node'));
		if (nativeStats.exists && nativeStats.size !== undefined) {
			console.info(`  cashew.node: ${(nativeStats.size / 1024).toFixed(1)} KB`);
			console.info(`\n  ${colors.bright}Total package size: ${((totalJsSize + nativeStats.size) / 1024).toFixed(1)} KB${colors.reset}`);
		}
	} catch (error) {
		console.error('Error calculating sizes:', error);
	}
}

async function buildAll(): Promise<void> {
	console.info(`${colors.bright}${colors.blue}Starting Rust + TypeScript build${colors.reset}\n`);
	const totalTimer = new BuildTimer('Total build time');

	try {
		const shouldClean = process.argv.includes('--clean');
		const isDev = process.argv.includes('--dev');

		if (shouldClean) {
			await runCommand('rimraf ./dist ./build', 'Clean build output');
		}

		const rustCacheValid = !shouldClean && (await checkRustBuildCache());
		const buildTasks = [runCommand('npm run build:types', 'TypeScript declarations'), runCommand('npm run build:js', 'JavaScript bundles')];

		if (!rustCacheValid) {
			buildTasks.push(runCommand(`node scripts/build-rust.js${isDev ? ' --dev' : ''}`, 'Rust native addon'));
		}

		await Promise.all(buildTasks);
		await copyNativeBindings();

		const totalTime = totalTimer.end(true);
		console.info(`\n${colors.bright}${colors.green}Build completed successfully in ${totalTime}s${colors.reset}`);
		await showBuildSizes();
	} catch {
		totalTimer.end(false);
		console.error(`\n${colors.bright}${colors.red}Build failed${colors.reset}`);
		process.exit(1);
	}
}

if (process.argv.includes('--watch')) {
	console.info(`${colors.yellow}Watch mode is not implemented for native Rust builds${colors.reset}`);
	console.info('Use npm run build:js -- --watch for JavaScript watch mode');
	process.exit(0);
}

buildAll().catch((error) => {
	console.error('Unexpected error:', error);
	process.exit(1);
});
