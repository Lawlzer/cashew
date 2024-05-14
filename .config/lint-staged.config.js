// Husky will run "npm run pre-commit" on commit
// This file is ran from "npm run pre-commit"

module.exports = {
	'**/*.{ts,tsx,js,jsx,json,jsonc}': [
		// We could test building the project, but our builder assumes valid input -> valid output. It will not error on invalid input, so building does not help test.
		'npm run lint:eslint --',
		'npm run lint:prettier --',
	],
};
