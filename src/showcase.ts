// Normal Jest do not seem super feasible for this project.
// It's hard to compartamentalize/isolate the tests for the bindings, without taking full keyboard/mouse control
// which... is not a good idea.

import { sleep } from '@lawlzer/utils';
import ms from 'ms';

import type { Image } from '.';
import { Clipboard, Keyboard, Mouse, Ocr, Screen } from '.';

// Keyboard does not currently auto-capitalize characters (you must do it yourself, manually, with shift)
// If somebody asked *really nicely*, this could be implemented -- but it wouldn't be feasible to work for *all* characters, as that's keyboard/driver-dependent (and implementing a driver is too much effort for me. I'm lazy. Somebody else could, though!)

(async () => {
	console.info(`Running manual/debug/whatever tests.ts file!`);

	// This video is 100% unedited!
	await Mouse.click({ button: 'left', position: { x: 1739, y: 800 }, windowTitle: 'OBS 30.0.2 - Profile: Untitled - Scenes: Untitled' });

	console.warn(`Waiting for f2 keypress!`);
	await Keyboard.waitForKeyPress('F2');

	// Win + R
	await Keyboard.holdKey('LeftWindowsKey');
	await Keyboard.tapKey('r');
	await Keyboard.releaseKeyDesktop('LeftWindowsKey');
	await sleep('1s');

	// Open Notepad
	await Keyboard.type('notepad.exe');
	await Keyboard.tapKey('enter');
	await sleep('1s');

	// Keyboard typing
	await Keyboard.type('keyboard - everything here is fully automated');
	void Keyboard.holdKeyFor('shift', 10);
	await Keyboard.type('1'); // shift + 1 -> !
	await sleep('1s');

	const originalClipboardText = await Clipboard.read();
	await Clipboard.write('\nFrom clipboard - Hello, World!');
	await Clipboard.paste();

	await Clipboard.write(originalClipboardText); // restore our original clipboard text

	await sleep('1s');

	// await Mouse.click({
	// 	button: 'left',
	// 	clickCount: 1,
	// 	position: { x: 50, y: 20 },
	// 	windowTitle: 'showcase.ts - cashew - Cursor',
	// });

	const mousePosition = await Mouse.getPosition();
	console.info(`Mouse position (does not change when clicking a background window): ${mousePosition.x}, ${mousePosition.y}`);

	// Take 1s of full image data, to see how fast it is.
	let start = Date.now();
	let runCount1920x1080 = 0;
	while (Date.now() - start < ms('1s')) {
		await Screen.initFromScreen(0, 0, 1920, 1080, 'showcase.ts - cashew - Cursor');
		runCount1920x1080++;
	}
	console.info(`Average time to get 1920x1080 pixels: ${(Date.now() - start) / runCount1920x1080}ms`);
	// ~30-50ms -- can be optimized for pure 1920x1080 (runs without changing X or Y). If you ask nicely, I can implement this :)

	let runCount1x1 = 0;
	start = Date.now();
	while (Date.now() - start < ms('1s')) {
		await Screen.initFromScreen(0, 0, 1, 1, 'showcase.ts - cashew - Cursor');
		runCount1x1++;
	}
	console.info(`Average time to get 1x1 pixels: ${(Date.now() - start) / runCount1x1}ms`);

	// start the video
	await Mouse.click({ button: 'left', position: { x: 1279, y: 789 }, windowTitle: 'Movies & TV' }); // end of video
	await Mouse.click({ button: 'left', position: { x: 711, y: 789 }, windowTitle: 'Movies & TV' }); // start of video
	await Keyboard.holdKeyFor('space', 50);

	start = Date.now();
	while (Date.now() - start < ms('5s')) {
		const image = await Screen.initFromScreen(90, 75, 430, 450, 'Movies & TV');
		await image.writeToFile('test.png'); // writeToFile is not built for speed (~1s for 1920x1080)
	}

	const inputImage = await Screen.initFromFile('white.jpg');
	const pixelColours = await inputImage.getPixel(50, 50);
	await inputImage.writeToFile('test.png');
	await sleep('1s');

	// We could iterate on the inputImage (and we will, there's no downside in this example)
	// but .slice exists, if you want to make a clone of an Image, and iterate/compare on both
	const newImage = inputImage.slice(0, 0, inputImage.width, inputImage.height);

	start = Date.now();
	// Thank you gpt-4o for writing the circle code <3 I hate math
	{
		async function setCirclePixels(image: Image, centerX: number, centerY: number, radius: number, color: { r: number; g: number; b: number; a: number }) {
			for (let y = -radius; y <= radius; y++) {
				for (let x = -radius; x <= radius; x++) {
					if (x * x + y * y <= radius * radius) {
						await image.setPixel(centerX + x, centerY + y, color);
					}
				}
			}
		}

		// Set the color for the smiley face
		const yellow = { r: 255, g: 255, b: 0, a: 255 };
		const black = { r: 0, g: 0, b: 0, a: 255 };

		// Draw the face
		await setCirclePixels(inputImage, 50, 50, 40, yellow);

		// Draw the eyes
		await setCirclePixels(inputImage, 35, 35, 5, black);
		await setCirclePixels(inputImage, 65, 35, 5, black);

		// Draw the mouth
		for (let x = 30; x <= 70; x++) {
			const y = 70 + Math.floor(10 * Math.sin((x - 30) * (Math.PI / 40)));
			await inputImage.setPixel(x, y, black);
		}
	}
	console.info(`Time taken to draw a giant, unoptimized circle: ${Date.now() - start}ms`);
	await inputImage.writeToFile('test.png');

	await Mouse.click({ button: 'left', position: { x: 1739, y: 800 }, windowTitle: 'OBS 30.0.2 - Profile: Untitled - Scenes: Untitled' });
	await sleep('1d');
})();
