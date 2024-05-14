import { Clipboard } from './utils/clipboard'; 
async function main() {
	const clipboardText = await Clipboard.writeText('hello world');
	console.log(clipboardText);
}
void main(); 

