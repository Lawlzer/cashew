import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Get number of CPU cores for parallel builds
const CPU_COUNT = os.cpus().length;
const PARALLEL_JOBS = Math.max(1, CPU_COUNT - 1); // Leave one core free

console.info(`🚀 Optimized C++ Build - Using ${PARALLEL_JOBS} parallel jobs on ${CPU_COUNT} cores`);

// Check if ccache is available
let USE_CCACHE = false;
try {
	execSync('ccache --version', { stdio: 'ignore' });
	USE_CCACHE = true;
	console.info('✅ ccache detected - will use for faster rebuilds');
} catch {
	console.info('⚠️  ccache not found - install it for faster C++ rebuilds');
	console.info('   Windows: choco install ccache');
	console.info('   Mac: brew install ccache');
	console.info('   Linux: apt-get install ccache');
}

// Development vs Production flags
const isDev = process.argv.includes('--dev');
const buildType = isDev ? 'Debug' : 'Release';

console.info(`🔧 Build type: ${buildType}`);

// Configure environment for faster builds
const buildEnv = {
	...process.env,
	// Use all cores
	JOBS: PARALLEL_JOBS.toString(),
	// Faster linker if available
	LDFLAGS: '-fuse-ld=lld',
};

if (USE_CCACHE) {
	buildEnv.CC = 'ccache gcc';
	buildEnv.CXX = 'ccache g++';
}

// Add Visual Studio specific optimizations on Windows
if (process.platform === 'win32') {
	// Use MultiProcessor compilation
	buildEnv.CL = '/MP';
}

async function buildCpp() {
	const startTime = Date.now();

	try {
		// Configure with optimizations
		console.info('⚙️  Configuring build...');
		const configCmd = `npx node-gyp configure --${buildType.toLowerCase()}`;
		execSync(configCmd, { env: buildEnv, stdio: 'inherit' });

		// Build with parallel jobs
		console.info(`🔨 Building with ${PARALLEL_JOBS} parallel jobs...`);
		const buildCmd = `npx node-gyp build -j ${PARALLEL_JOBS}`;
		execSync(buildCmd, { env: buildEnv, stdio: 'inherit' });

		const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
		console.info(`✅ C++ build completed in ${elapsed}s`);

		// Show ccache statistics if available
		if (USE_CCACHE) {
			console.info('\n📊 ccache statistics:');
			execSync('ccache -s', { stdio: 'inherit' });
		}
	} catch (error) {
		const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
		console.error(`❌ C++ build failed after ${elapsed}s`);
		throw error;
	}
}

// Create optimized binding.gyp for development builds
if (isDev) {
	console.info('📝 Creating optimized binding.gyp for development...');

	const bindingPath = path.join(process.cwd(), 'binding.gyp');
	const originalBinding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));

	// Add development optimizations
	originalBinding.target_defaults = originalBinding.target_defaults || {};
	originalBinding.target_defaults.configurations = {
		Debug: {
			defines: ['DEBUG', '_DEBUG', 'NODE_GYP_MODULE_NAME'],
			cflags: ['-O0', '-g'], // No optimization, debug symbols
			msvs_settings: {
				VCCLCompilerTool: {
					Optimization: 0, // /Od
					MinimalRebuild: false,
					ExceptionHandling: 1,
					RuntimeTypeInfo: 'true',
					MultiProcessorCompilation: 'true', // /MP
					WholeProgramOptimization: 'false',
				},
			},
		},
		Release: {
			defines: ['NDEBUG'],
			cflags: ['-O3', '-fno-exceptions', '-fno-rtti'],
			msvs_settings: {
				VCCLCompilerTool: {
					Optimization: 3, // /Ox
					FavorSizeOrSpeed: 1, // favor speed
					InlineFunctionExpansion: 2,
					WholeProgramOptimization: 'true',
					MultiProcessorCompilation: 'true', // /MP
					ExceptionHandling: 0,
					RuntimeTypeInfo: 'false',
				},
			},
		},
	};

	// Don't modify the original file, node-gyp will use the configurations
}

// Run the build
buildCpp().catch((error) => {
	console.error('Build failed:', error);
	process.exit(1);
});
