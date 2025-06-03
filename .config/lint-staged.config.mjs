// Run linting only on committed files, not the entire codebase

export default {
	'**/*.{ts,tsx,js,jsx,json,jsonc}': ['npm run lint:eslint', 'npm run lint:prettier'],
};
