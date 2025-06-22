import { initToggleMonitor } from '../src';

console.info('Toggle Monitor Example\n');
console.info('This example shows how to use the improved toggle monitor with native hooks.\n');

// Example 1: Simple toggle with messages
console.info('Example 1: Press F1 to toggle a feature on/off');
const cleanupF1 = initToggleMonitor({
	key: 'F1',
	func: (isActive) => {
		console.info(`  Feature is now: ${isActive ? 'ENABLED' : 'DISABLED'}`);
	},
	onMessage: '  Feature ENABLED! 🟢',
	offMessage: '  Feature DISABLED! 🔴',
	initialState: false,
	postToggleDelayMs: 500, // Prevent rapid toggling
});

// Example 2: Toggle without messages
console.info('\nExample 2: Press F2 to toggle silent mode');
let silentMode = false;
const cleanupF2 = initToggleMonitor({
	key: 'F2',
	func: (isActive) => {
		silentMode = isActive;
		if (!silentMode) {
			console.info(`  Silent mode: ${isActive}`);
		}
	},
	onMessage: false, // No message when turning on
	offMessage: false, // No message when turning off
	initialState: false,
});

// Example 3: Toggle with custom logic
console.info('\nExample 3: Press F3 to toggle counter (increments when ON)');
let counterEnabled = false;
let counter = 0;
const cleanupF3 = initToggleMonitor({
	key: 'F3',
	func: (isActive) => {
		counterEnabled = isActive;
		console.info(`  Counter ${isActive ? 'started' : 'stopped'} at: ${counter}`);
	},
	initialState: false,
});

// Background counter that only increments when enabled
setInterval(() => {
	if (counterEnabled) {
		counter++;
		if (counter % 10 === 0) {
			console.info(`  Counter: ${counter}`);
		}
	}
}, 100);

// Set up ESC to exit and cleanup
console.info('\nPress ESC to exit and cleanup all monitors\n');
const { Keyboard } = await import('../src');
const cleanupEsc = Keyboard.onKeypress('escape', () => {
	console.info('\nCleaning up and exiting...');

	// Clean up all monitors
	cleanupF1();
	cleanupF2();
	cleanupF3();
	cleanupEsc();

	process.exit(0);
});

// Keep the process running
setInterval(() => {}, 1000);
