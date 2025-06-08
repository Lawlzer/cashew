#!/usr/bin/env bun

/**
 * Basic usage example for @lawlzer/cashew
 * Run with: bun run examples/basic-usage.ts
 */

import { getForegroundWindowTitle, Keyboard, Mouse } from '../src/index';

async function main() {
	console.info('🎮 Cashew Basic Usage Example\n');

	// Get current window title
	console.info('📋 Getting window information...');
	const windowTitle = await getForegroundWindowTitle();
	console.info(`Current window: ${windowTitle}\n`);

	// Get mouse position
	console.info('🖱️ Getting mouse position...');
	const mousePos = await Mouse.getPosition();
	console.info(`Mouse at: (${mousePos.x}, ${mousePos.y})\n`);

	// Check if a key is pressed
	console.info('⌨️ Checking keyboard state...');
	const shiftPressed = await Keyboard.isKeyPressed('shift');
	console.info(`Shift key pressed: ${shiftPressed}\n`);

	// Example: Listen for key press (with cleanup)
	console.info('👂 Setting up key listener for "escape" key...');
	console.info('Press ESC to stop the demo\n');

	const cleanup = Keyboard.onKeypress('escape', (event) => {
		console.info(`\n✅ Escape key pressed at ${new Date(event.timestamp).toLocaleTimeString()}`);
		console.info('Cleaning up and exiting...');
		cleanup(); // Stop the listener
		process.exit(0);
	});

	// Keep the script running
	console.info('Demo is running. Press ESC to exit.');
	await new Promise(() => {}); // Keep process alive
}

// Run the demo
main().catch(console.error);
