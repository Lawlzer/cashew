import { exec } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ANSI color codes for better output
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
};

// Build timer with performance metrics
class BuildTimer {
	private readonly startTime: number;
	private readonly taskName: string;

	public constructor(taskName: string) {
		this.taskName = taskName;
		this.startTime = Date.now();
		console.info(`${colors.blue}⏱️  Starting: ${taskName}${colors.reset}`);
	}

	public end(success = true): number {
		const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
		const icon = success ? '✅' : '❌';
		const color = success ? colors.green : colors.red;

		console.info(`${color}${icon} ${this.taskName} completed in ${duration}s${colors.reset}`);
		return parseFloat(duration);
	}
}

// Utility functions
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

async function getFileStats(filePath: string): Promise<{ exists: boolean; mtime?: number }> {
	try {
		const stat = await fs.stat(filePath);
		return { exists: true, mtime: stat.mtimeMs };
	} catch {
		return { exists: false };
	}
}

// Optimized command runner with better error handling
async function runCommand(command: string, description: string, options?: { env?: Record<string, string> }): Promise<void> {
	const timer = new BuildTimer(description);
	try {
		const { stderr } = await execAsync(command, {
			env: { ...process.env, ...options?.env },
			maxBuffer: 10 * 1024 * 1024, // 10MB buffer
		});

		// Only show warnings if they're not just info messages
		if (stderr && !stderr.includes('info') && !stderr.includes('Creating library')) {
			console.warn(`${colors.yellow}⚠️  ${description} warnings:${colors.reset}`);
			console.warn(stderr.trim());
		}

		timer.end(true);
	} catch (error: any) {
		timer.end(false);
		console.error(`${colors.red}❌ ${description} failed:${colors.reset}`);
		console.error(error.message);
		if (error.stdout) console.error('stdout:', error.stdout);
		if (error.stderr) console.error('stderr:', error.stderr);
		throw error;
	}
}

// Special command runner for C++ builds with retry logic
async function runCppBuildWithRetry(command: string, description: string, options?: { env?: Record<string, string> }): Promise<void> {
	try {
		// First attempt
		await runCommand(command, description, options);
	} catch (error) {
		console.info(`\n${colors.yellow}⚠️  C++ build failed, attempting cleanup and retry...${colors.reset}`);

		// Clean build directories
		const cleanTimer = new BuildTimer('Cleaning build directories for retry');
		try {
			await execAsync('rimraf ./build', {
				maxBuffer: 10 * 1024 * 1024,
			});
			cleanTimer.end(true);
		} catch (cleanError) {
			cleanTimer.end(false);
			console.error('Failed to clean build directories:', cleanError);
			throw error; // Throw original error if clean fails
		}

		// Retry the build
		console.info(`${colors.blue}🔄 Retrying C++ build...${colors.reset}\n`);
		try {
			await runCommand(command, `${description} (retry)`, options);
			console.info(`${colors.green}✅ C++ build succeeded on retry!${colors.reset}`);
		} catch (retryError) {
			console.error(`${colors.red}❌ C++ build failed on retry as well${colors.reset}`);
			throw retryError;
		}
	}
}

// Optimized native binding copying
async function copyNativeBindings(): Promise<void> {
	const timer = new BuildTimer('Copy native bindings');
	try {
		const sourceDir = path.join(process.cwd(), 'build', 'Release');
		const destDir = path.join(process.cwd(), 'dist', 'build', 'Release');

		// Ensure directories exist
		await ensureDir(destDir);

		// Get all .node files
		const files = await fs.readdir(sourceDir);
		const nodeFiles = files.filter((file) => file.endsWith('.node'));

		if (nodeFiles.length === 0) {
			throw new Error('No .node files found in build/Release');
		}

		// Copy files in parallel
		await Promise.all(
			nodeFiles.map(async (nodeFile) => {
				const sourcePath = path.join(sourceDir, nodeFile);
				const destPath = path.join(destDir, nodeFile);

				// Check if we need to copy (source is newer than destination)
				const [sourceStats, destStats] = await Promise.all([getFileStats(sourcePath), getFileStats(destPath)]);

				if (!destStats.exists || (sourceStats.mtime !== undefined && destStats.mtime !== undefined && sourceStats.mtime > destStats.mtime)) {
					await fs.copyFile(sourcePath, destPath);
					console.info(`  ${colors.cyan}📦 Updated ${nodeFile}${colors.reset}`);
				} else {
					console.info(`  ${colors.cyan}✓ ${nodeFile} is up to date${colors.reset}`);
				}
			})
		);

		console.info(`  ${colors.green}✨ ${nodeFiles.length} native bindings processed${colors.reset}`);
		timer.end(true);
	} catch (error) {
		timer.end(false);
		throw error;
	}
}

// Enhanced C++ build cache checking
async function checkCppBuildCache(): Promise<boolean> {
	const cppFiles = ['src/cpp/clipboard.cpp', 'src/cpp/screen.cpp', 'src/cpp/keyboard.cpp', 'src/cpp/keyboard_refactored.cpp', 'src/cpp/keyboardSync.cpp', 'src/cpp/mouse.cpp', 'src/cpp/mouse_refactored.cpp', 'src/cpp/misc.cpp', 'src/cpp/screenRaw.cpp', 'src/cpp/panicShutdown.cpp', 'src/cpp/keyboardHooks.cpp', 'src/cpp/common.h', 'src/cpp/input_utils.h', 'src/cpp/screen_utils.h'];

	const bindingGyp = 'binding.gyp';
	const buildDir = 'build/Release';

	try {
		// Check if build directory exists
		if (!(await fileExists(buildDir))) {
			console.info(`  ${colors.yellow}⚡ Build directory missing, rebuild needed${colors.reset}`);
			return false;
		}

		// Get all modification times in parallel
		const fileStats = await Promise.all([getFileStats(bindingGyp), ...cppFiles.map(async (file) => getFileStats(file))]);

		// Find most recent source modification
		let mostRecentSourceTime = 0;
		for (const stat of fileStats) {
			if (stat.exists && stat.mtime !== undefined) {
				mostRecentSourceTime = Math.max(mostRecentSourceTime, stat.mtime);
			}
		}

		// Get expected .node files
		const expectedNodeFiles = [...new Set(cppFiles.filter((f) => f.endsWith('.cpp')).map((f) => `${path.basename(f, '.cpp').replace('_refactored', '')}.node`))];

		// Check all .node files in parallel
		const nodeChecks = await Promise.all(
			expectedNodeFiles.map(async (nodeFile) => {
				const nodePath = path.join(buildDir, nodeFile);
				const stats = await getFileStats(nodePath);

				if (!stats.exists) {
					console.info(`  ${colors.yellow}⚡ Missing ${nodeFile}, rebuild needed${colors.reset}`);
					return false;
				}

				if (stats.mtime !== undefined && stats.mtime < mostRecentSourceTime) {
					console.info(`  ${colors.yellow}⚡ ${nodeFile} is outdated, rebuild needed${colors.reset}`);
					return false;
				}

				return true;
			})
		);

		const allValid = nodeChecks.every((valid) => valid);
		if (allValid) {
			console.info(`  ${colors.green}✨ C++ build cache is valid, skipping rebuild${colors.reset}`);
		}

		return allValid;
	} catch {
		return false;
	}
}

// Build output analysis
async function showBuildSizes(): Promise<void> {
	console.info(`\n${colors.cyan}📊 Build output sizes:${colors.reset}`);

	try {
		// Check TypeScript/JavaScript files
		const distFiles = await fs.readdir('dist');
		const jsFiles = distFiles.filter((f) => f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.d.ts'));

		const fileSizes = await Promise.all(
			jsFiles.map(async (file) => {
				const filePath = path.join('dist', file);
				const stat = await fs.stat(filePath);
				return { file, size: stat.size };
			})
		);

		// Sort by size descending
		fileSizes.sort((a, b) => b.size - a.size);

		let totalJsSize = 0;
		for (const { file, size } of fileSizes) {
			totalJsSize += size;
			console.info(`  ${file}: ${(size / 1024).toFixed(1)} KB`);
		}

		// Check native bindings
		const nativeDir = path.join('dist', 'build', 'Release');
		if (await fileExists(nativeDir)) {
			const nativeFiles = await fs.readdir(nativeDir);
			const nodeFiles = nativeFiles.filter((f) => f.endsWith('.node'));

			const nativeSizes = await Promise.all(
				nodeFiles.map(async (file) => {
					const stat = await fs.stat(path.join(nativeDir, file));
					return stat.size;
				})
			);

			const totalNativeSize = nativeSizes.reduce((sum, size) => sum + size, 0);
			console.info(`  Native bindings: ${(totalNativeSize / 1024).toFixed(1)} KB total (${nodeFiles.length} files)`);

			// Total package size
			const totalSize = totalJsSize + totalNativeSize;
			console.info(`\n  ${colors.bright}Total package size: ${(totalSize / 1024).toFixed(1)} KB${colors.reset}`);
		}
	} catch (error) {
		console.error('Error calculating sizes:', error);
	}
}

// Main build orchestrator
async function buildAll(): Promise<void> {
	console.info(`${colors.bright}${colors.blue}🚀 Starting optimized parallel build...${colors.reset}\n`);
	const totalTimer = new BuildTimer('Total build time');

	try {
		// Parse arguments
		const shouldClean = process.argv.includes('--clean');
		const isDev = process.argv.includes('--dev');

		// Clean if requested
		if (shouldClean) {
			await runCommand('rimraf ./build', 'Clean previous build');
		}

		// Check C++ cache
		const cppCacheValid = !shouldClean && (await checkCppBuildCache());

		// Define parallel build tasks
		const buildTasks: Promise<void>[] = [
			// TypeScript declarations
			runCommand('npm run build:types', 'TypeScript declarations'),

			// JavaScript bundles
			runCommand('npm run build:js', 'JavaScript bundles (ESM + CJS)'),
		];

		// Add C++ build if needed
		if (!cppCacheValid) {
			const cppEnv = isDev ? { NODE_ENV: 'development' } : undefined;
			buildTasks.push(runCppBuildWithRetry(`node scripts/build-cpp-optimized.js${isDev ? ' --dev' : ''}`, 'C++ native modules (optimized)', { env: cppEnv }));
		}

		// Execute all build tasks in parallel
		await Promise.all(buildTasks);

		// Copy native bindings (after C++ build if it ran)
		if (!cppCacheValid) {
			await copyNativeBindings();
		}

		// Success summary
		const totalTime = totalTimer.end(true);
		console.info(`\n${colors.bright}${colors.green}🎉 Build completed successfully in ${totalTime}s!${colors.reset}`);

		// Show build analysis
		await showBuildSizes();

		// Performance tip
		if (totalTime > 10) {
			console.info(`\n${colors.yellow}💡 Tip: Use --clean sparingly to benefit from build caching${colors.reset}`);
		}
	} catch (_error) {
		totalTimer.end(false);
		console.error(`\n${colors.bright}${colors.red}💥 Build failed!${colors.reset}`);
		process.exit(1);
	}
}

// Handle watch mode
if (process.argv.includes('--watch')) {
	console.info(`${colors.yellow}👁️  Watch mode is not yet implemented for parallel builds${colors.reset}`);
	console.info('Use npm run build:js -- --watch for JavaScript watch mode');
	process.exit(0);
}

// Run the build
buildAll().catch((error) => {
	console.error('Unexpected error:', error);
	process.exit(1);
});
