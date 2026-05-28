#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, statSync } from 'fs';
import path from 'path';

const isDev = process.argv.includes('--dev');
const profile = isDev ? 'debug' : 'release';
const cargoArgs = ['build'];

if (!isDev) {
	cargoArgs.push('--release');
}

console.info(`Building Rust native addon (${profile})...`);
execFileSync('cargo', cargoArgs, { stdio: 'inherit' });

const platformLibrary = (() => {
	if (process.platform === 'win32') return 'cashew.dll';
	if (process.platform === 'darwin') return 'libcashew.dylib';
	return 'libcashew.so';
})();

const source = path.join(process.cwd(), 'target', profile, platformLibrary);
if (!existsSync(source)) {
	throw new Error(`Rust build succeeded but native library was not found at ${source}`);
}

const outDir = path.join(process.cwd(), 'build', 'Release');
mkdirSync(outDir, { recursive: true });

const output = path.join(outDir, 'cashew.node');
copyFileSync(source, output);

const sizeKb = (statSync(output).size / 1024).toFixed(1);
console.info(`Wrote ${path.relative(process.cwd(), output)} (${sizeKb} KB)`);
