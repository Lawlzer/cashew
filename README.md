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

### Screen/Image

```typescript
import { Screen, Image } from '@lawlzer/cashew';
// Capture a portion of the screen
const image = await Screen.initFromScreen(0, 0, 1920, 1080, 'window-title-goes-here');

await image.writeToFile('screenshot.png'); // Save image to file

const pixelColor = await image.getPixel(50, 50); // Get pixel color
console.log(pixelColor);

const imageFromFile = await Screen.initFromFile('screenshot.png'); // Read the image from a file
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
