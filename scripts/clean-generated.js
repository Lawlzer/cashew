#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';

const filesToClean = ['build-parallel.js', 'build-parallel.d.ts', '.tsconfig.incremental.json'];

async function cleanGeneratedFiles() {
	console.info('🧹 Cleaning generated build files...');

	for (const file of filesToClean) {
		try {
			await fs.unlink(file);
			console.info(`  ✅ Removed ${file}`);
		} catch (error) {
			if (error.code !== 'ENOENT') {
				console.error(`  ❌ Error removing ${file}:`, error.message);
			}
		}
	}

	console.info('✨ Cleanup complete!');
}

cleanGeneratedFiles().catch((error) => {
	console.error('Fatal error during cleanup:', error);
	process.exit(1);
});
