# @Lawlzer/cashew (a nut-free alternative)

## Overview

This package provides utilities for automating keyboard, mouse, screen, OCR, and clipboard interactions.

This package is built for maximum performance, and working on background windows/applications! This is _my_ dream package for macros.

// No external dependencies, just pure magic. (that's a code-word for C++, mostly written by GPT 3.5 to 4o)

// ONLY works on Windows! I do not use Linux/MacOS, so I'm not going to support them. You can make a PR, if you'd like :)

## Installation

```c
npm i @lawlzer/cashew
// or pnpm, or bun (my favourite!)
```

### Keyboard

```typescript
import { Keyboard } from '@lawlzer/cashew';
await Keyboard.type('Hello, World!'); // Type text

await Keyboard.tapKey('enter'); // Tap and release a key
await Keyboard.holdKey('shift'); // Hold a key
await Keyboard.releaseKey('shift'); // Release a key
// wow, those comments are so helpful.

await Keyboard.waitForKeyPress('F2'); // Wait for a key press
```

### Mouse

```typescript
import { Mouse } from '@lawlzer/cashew';

await Mouse.click({ button: 'left', position: { x: 100, y: 200 }, windowTitle: 'put-something-here' });

const mousePosition = await Mouse.getPosition();
console.log(mousePosition); // { x: 100, y: 200 }
```

#### Relative Mouse Movement (for FPS games and locked cursors)

```typescript
import { Mouse } from '@lawlzer/cashew';

// Move mouse relative to current position
await Mouse.moveRelative({
	dx: 100, // Move 100 pixels right
	dy: -50, // Move 50 pixels up
	smoothDuration: 200, // Smooth movement over 200ms
	useRawInput: true, // Use raw input for games (doesn't move actual cursor)
});

// Look in a specific direction using angle and distance
await Mouse.lookAt({
	angle: 90, // 90 degrees = up, 0 = right, 180 = left, 270 = down
	distance: 100, // Move 100 pixels in that direction
	smoothDuration: 150,
	useRawInput: true, // Recommended for FPS games
});

// Camera helper methods for FPS games
await Mouse.camera.lookUp(10, 5, true); // Look up 10 degrees (5 pixels per degree, smooth)
await Mouse.camera.lookDown(5, 5, true); // Look down 5 degrees
await Mouse.camera.turnLeft(45, 4, true); // Turn left 45 degrees
await Mouse.camera.turnRight(90, 3, false); // Turn right 90 degrees (instant, no smoothing)

// Simulating weapon recoil compensation
const recoilPattern = [
	{ dx: 0, dy: -5 }, // Initial upward kick
	{ dx: 2, dy: -8 }, // More up with slight right
	{ dx: -1, dy: -6 }, // Up with slight left
];

for (const movement of recoilPattern) {
	await Mouse.moveRelative({
		dx: movement.dx,
		dy: movement.dy,
		smoothDuration: 50,
		useRawInput: true,
	});
	await sleep(100); // Delay between shots
}
```

**Tips for game automation:**

- Use `useRawInput: true` for FPS games where the cursor is locked/centered
- Adjust `pixelsPerDegree` based on your game's sensitivity settings
- Use smooth movements for natural-looking camera control
- Use instant movements (`smoothDuration: 0` or `smooth: false`) for quick flicks/turns

### Screen/Image

```typescript
import { Screen, Image } from '@lawlzer/cashew';

// Capture a portion of the screen
const image = await Screen.initFromScreen(0, 0, 1920, 1080, 'window-title-goes-here');

await image.writeToFile('screenshot.png'); // Save image to file

const pixelColor = await image.getPixel(50, 50); // Get pixel color
console.log(pixelColor);

const imageFromFile = await Screen.initFromFile('screenshot.png'); // Read the image from a file

const singleScreenPixelEasy = await Screen.getSingleScreenPixel(100, 200, 'window-title-goes-here'); // get the pixel at 100, 200
```

### Clipboard

```typescript
import { Clipboard } from '@lawlzer/cashew';
// Read text from clipboard
const clipboardText = await Clipboard.readText();
console.log(clipboardText); // Read text from clipboard
await Clipboard.write('Hello, Clipboard!'); // Write text to clipboard
await Clipboard.paste(); // Do I really need to explain this?
```

### OCR

This is a very lazy wrapper around Tesseract.js. If you want anything remotely complex, I'd recommend uing Tesseract.js directly. (I may update this in the future)

```typescript
import { Ocr } from '@lawlzer/cashew';
// Recognize text from an image
const text = await Ocr.recognize('path/to/image.png');
console.log(text);
// There is no (current) utility for reading an image from the clipboard or a variable. It MUST be written to a file.
```

### Async vs Sync Operations

This library now provides both synchronous and truly asynchronous versions of operations that involve delays or significant processing time. The async versions run on worker threads and don't block the Node.js event loop.

#### When to use Async versions:

- **Screen capture** of large areas
- **Mouse clicks** with hold delays
- **Keyboard typing** with delays between keys
- Any operation where you need to maintain UI responsiveness or handle other events

#### Available Async Methods:

```typescript
// Screen - Non-blocking screen capture
const image = await Screen.initFromScreenAsync(0, 0, 1920, 1080);
const pixel = await Screen.getSingleScreenPixelAsync(100, 200);

// Mouse - Non-blocking clicks with delays
await Mouse.clickAsync({ position: { x: 100, y: 200 }, holdFor: 500 });
await Mouse.clickMessageAsync({ position: { x: 100, y: 200 }, windowTitle: 'App', type: 'post', holdFor: 300 });

// Keyboard - Non-blocking typing with delays
await Keyboard.typeAsync('Hello World', { delayPerKey: 50 });
await Keyboard.holdKeyForAsync('shift', 1000); // Hold shift for 1 second
```

#### Performance Benefits:

1. **Parallel Operations**: You can run multiple async operations simultaneously

   ```typescript
   // Run 5 screen captures in parallel
   const images = await Promise.all([Screen.initFromScreenAsync(0, 0, 100, 100), Screen.initFromScreenAsync(100, 0, 100, 100), Screen.initFromScreenAsync(200, 0, 100, 100), Screen.initFromScreenAsync(300, 0, 100, 100), Screen.initFromScreenAsync(400, 0, 100, 100)]);
   ```

2. **Non-blocking Event Loop**: Your application remains responsive during long operations
   ```typescript
   // This won't block other timers, event handlers, etc.
   await Keyboard.typeAsync('A very long text...', { delayPerKey: 100 });
   ```

### MISC/Utilities

- Most utilities are secretly sync, but I made all of them async, incase that is changed in the future. Most utilities take sub-1ms to run, so it's not actually an issue, except for maybe some Screen/Image utilities.
- There is a "setProcessConfig" utility, which will automatically set the windowTitle (for all relevant utilities), so it's not repeated across the codebase.

```typescript
import { Config } from '@lawlzer/cashew';
Config.setProcessConfig({ windowTitle: undefined });
```

- If you're using this package to write macros, I'd _highly_ recommend running the following utility on startup (press pgDown to "panic" shutdown the script)

```typescript
import { Keyboard } from '@lawlzer/cashew';

async function handlePanicShutdown() {
	await Keyboard.waitForKeyPress('pageDown');
	console.info('Shutting down because pageDown was pressed!');
	process.exit(0);
}
```
