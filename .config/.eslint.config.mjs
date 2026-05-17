// @ts-check
import path from 'node:path';

import prettierConfig from 'eslint-config-prettier';

import { createConfig } from '@lawlzer/config/eslint';

const baseConfig = createConfig(path.resolve(import.meta.dirname, '../tsconfig.eslint.json'));

export default [
	...baseConfig,
	{
		ignores: ['routeTypes', 'debug', 'data'],
	},
	prettierConfig,
];
