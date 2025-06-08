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

class BuildTimer {
	private readonly startTime: number;
	private readonly taskName: string;

	public constructor(taskName: string) {
		this.taskName = taskName;
		this.startTime = Date.now();
		console.info(`${colors.blue}⏱️  Starting: ${taskName}${colors.reset}`);
	}

	public end(success = true) {
		const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
		const icon = success ? '✅' : '❌';
		const color = success ? colors.green : colors.red;
		console.info(`${color}${icon} ${this.taskName} completed in ${duration}s${colors.reset}`);
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

async function runCommand(command: string, description: string): Promise<void> {
	const timer = new BuildTimer(description);
	try {
		const { stderr } = await execAsync(command, {
			env: { ...process.env },
			maxBuffer: 10 * 1024 * 1024, // 10MB buffer
		});

		if (stderr && !stderr.includes('info')) {
			console.warn(`${colors.yellow}⚠️  ${description} warnings:${colors.reset}`);
			console.warn(stderr);
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

async function copyNativeBindings(): Promise<void> {
	const timer = new BuildTimer('Copy native bindings');
	try {
		const sourceDir = path.join(process.cwd(), 'build', 'Release');
		const destDir = path.join(process.cwd(), 'dist', 'build', 'Release');

		// Ensure destination directory exists
		await ensureDir(destDir);

		// Get all .node files from the source directory
		const files = await fs.readdir(sourceDir);
		const nodeFiles = files.filter((file) => file.endsWith('.node'));

		if (nodeFiles.length === 0) {
			throw new Error('No .node files found in build/Release');
		}

		// Copy each .node file
		const copyPromises = nodeFiles.map(async (nodeFile) => {
			const sourcePath = path.join(sourceDir, nodeFile);
			const destPath = path.join(destDir, nodeFile);
			await fs.copyFile(sourcePath, destPath);
			console.info(`  ${colors.cyan}📦 Copied ${nodeFile}${colors.reset}`);
		});

		await Promise.all(copyPromises);
		console.info(`  ${colors.green}✨ Total ${nodeFiles.length} native bindings copied${colors.reset}`);
		timer.end(true);
	} catch (error) {
		timer.end(false);
		throw error;
	}
}

async function checkCppBuildCache(): Promise<boolean> {
	// Check if we need to rebuild C++ by comparing source file timestamps with built files
	const cppFiles = ['src/cpp/clipboard.cpp', 'src/cpp/screen.cpp', 'src/cpp/keyboard.cpp', 'src/cpp/mouse.cpp', 'src/cpp/misc.cpp', 'src/cpp/screenRaw.cpp', 'src/cpp/panicShutdown.cpp'];

	const bindingGyp = 'binding.gyp';
	const buildDir = 'build/Release';

	try {
		// Check if build directory exists
		if (!(await fileExists(buildDir))) {
			return false;
		}

		// Get binding.gyp modification time
		const bindingGypStat = await fs.stat(bindingGyp);
		const bindingGypTime = bindingGypStat.mtimeMs;

		// Get most recent source file modification time
		let mostRecentSourceTime = bindingGypTime;
		for (const cppFile of cppFiles) {
			if (await fileExists(cppFile)) {
				const stat = await fs.stat(cppFile);
				mostRecentSourceTime = Math.max(mostRecentSourceTime, stat.mtimeMs);
			}
		}

		// Check if all expected .node files exist and are newer than sources
		const expectedNodeFiles = cppFiles.map((f) => `${path.basename(f, '.cpp')}.node`);

		for (const nodeFile of expectedNodeFiles) {
			const nodePath = path.join(buildDir, nodeFile);
			if (!(await fileExists(nodePath))) {
				console.info(`  ${colors.yellow}⚡ Missing ${nodeFile}, rebuild needed${colors.reset}`);
				return false;
			}

			const nodeStat = await fs.stat(nodePath);
			if (nodeStat.mtimeMs < mostRecentSourceTime) {
				console.info(`  ${colors.yellow}⚡ ${nodeFile} is outdated, rebuild needed${colors.reset}`);
				return false;
			}
		}

		console.info(`  ${colors.green}✨ C++ build cache is valid, skipping rebuild${colors.reset}`);
		return true;
	} catch {
		return false;
	}
}

async function showBuildSizes(): Promise<void> {
	console.info(`\n${colors.cyan}📊 Build output sizes:${colors.reset}`);

	const distDir = 'dist';
	const files = await fs.readdir(distDir);

	for (const file of files) {
		if (file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.d.ts')) {
			const filePath = path.join(distDir, file);
			const stat = await fs.stat(filePath);
			const sizeKB = (stat.size / 1024).toFixed(1);
			console.info(`  ${file}: ${sizeKB} KB`);
		}
	}

	// Show native bindings size
	const nativeDir = path.join(distDir, 'build', 'Release');
	if (await fileExists(nativeDir)) {
		const nativeFiles = await fs.readdir(nativeDir);
		let totalSize = 0;
		for (const file of nativeFiles) {
			if (file.endsWith('.node')) {
				const stat = await fs.stat(path.join(nativeDir, file));
				totalSize += stat.size;
			}
		}
		console.info(`  Native bindings: ${(totalSize / 1024).toFixed(1)} KB total`);
	}
}

async function buildAll(): Promise<void> {
	console.info(`${colors.bright}${colors.blue}🚀 Starting optimized parallel build...${colors.reset}\n`);
	const totalTimer = new BuildTimer('Total build time');

	try {
		// Clean check
		const shouldClean = process.argv.includes('--clean');
		if (shouldClean) {
			await runCommand('npm run clean', 'Clean previous build');
		}

		// Check if C++ rebuild is needed
		const cppCacheValid = !shouldClean && (await checkCppBuildCache());

		// Define build tasks
		const tasks: Promise<void>[] = [];

		// TypeScript types build
		tasks.push(runCommand('npm run build:types', 'TypeScript declarations'));

		// JavaScript build with tsup
		tasks.push(runCommand('npm run build:js', 'JavaScript bundles (ESM + CJS)'));

		// C++ build (only if needed)
		if (!cppCacheValid) {
			// Use optimized C++ build with parallel compilation
			const cppCommand = `node scripts/build-cpp-optimized.js${process.argv.includes('--dev') ? ' --dev' : ''}`;
			tasks.push(runCommand(cppCommand, 'C++ native modules (optimized)'));
		}

		// Run all tasks in parallel
		await Promise.all(tasks);

		// Copy native bindings after C++ build completes
		await copyNativeBindings();

		// Final summary
		const totalTime = totalTimer.end(true);
		console.info(`\n${colors.bright}${colors.green}🎉 Build completed successfully in ${totalTime}s!${colors.reset}`);

		// Show size summary
		await showBuildSizes();
	} catch (error) {
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
