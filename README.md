todo writing this is going to suck


import { initDotenv } from '@lawlzer/utils';
import keyboard from 'src/utils/keyboard';

async function handlePanicShutdown() {
	await keyboard.waitForKeyPress('pageDown');
	console.info('Shutting down because pageDown was pressed!');
	process.exit(0);
}

initDotenv();
void handlePanicShutdown();


	/**
	 * THIS IS SYNC, but runs in 0-1ms/run, so I'm not worried about it blocking the main thread.
	 *
	 * We could spawn a worker to run the function so it runs async, but it takes ~500ms to spawn a worker...
	 */