import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import path from 'path';
import process from 'process';
import importPlugin from 'eslint-plugin-import';
const commit = false;

console.log(`process.env.LINT_STAGED: ${process.env.LINT_STAGED}`);
console.log(`process.env.LINT_STAGED_CUSTOM: ${process.env.LINT_STAGED_CUSTOM}`);
console.log(`process.env.HUSKY: ${process.env.HUSKY}`);
console.log(`!!process.env.GIT_PARAMS: ${!!process.env.GIT_PARAMS}`);

export default tseslint.config(
	{
		// Global ignores
		ignores: ['dist', 'build', 'node_modules', 'logs', 'cache', 'caches', 'temp', 'tmp', 'debug', 'todo', 'serverOutput', 'public'],
	},
	eslint.configs.recommended,
	// Use a basic non-type-checked config for JS/MJS files
	{
		files: ['**/*.js', '**/*.mjs'],
		extends: [tseslint.configs.recommended],
	},
	// Use type-checked config for TS files
	{
		files: ['**/*.ts', '**/*.tsx'],
		extends: [tseslint.configs.recommendedTypeChecked],
		plugins: {
			// '@typescript-eslint': tseslint, // todo
			import: importPlugin,
			// 'unused-imports': unusedImports,
		},
		languageOptions: {
			parserOptions: {
				allowDefaultProject: ['*.mjs', '*.js'],
				defaultProject: true,
				tsconfigRootDir: process.cwd(),
				project: [path.resolve(process.cwd(), 'tsconfig.json')],
				ecmaFeatures: {},
				sourceType: 'module',
				ecmaVersion: 'latest',
			},
		},
		rules: {
			strict: 2,

			'@typescript-eslint/unbound-method': 'off', // experimental

			// Disallow all "var" usage
			'no-var': commit ? 'error' : 'off',
			// '@typescript/no-var': 'error', // Not a rule

			// Do not allow variables and types to share <the exact same> name
			'@typescript-eslint/no-redeclare': ['error'],

			// EXPERIMENTAL - Overloads must be ordered from most -> least specific
			'@typescript-eslint/adjacent-overload-signatures': 'error',

			// Use T[], instead of Array<T>
			'@typescript-eslint/array-type': ['error'],

			// Disallow interfaces -> only use types, or always use interfaces when possible
			// '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],

			// Require import type { ... } from '...' when possible
			// This solves bugs with types that are removed post-build (as the file may no longer be imported)
			'@typescript-eslint/consistent-type-imports': ['error'],

			// Require functions to explicitly define the return types
			// '@typescript-eslint/explicit-module-boundary-types': ['error', ],

			// Disallow null assertion next to math or functions ( if (a! + 2) )
			'@typescript-eslint/no-confusing-non-null-assertion': 'error',

			// var!!!!!.maybeExists
			'@typescript-eslint/no-extra-non-null-assertion': ['error'],

			// ? Something about classes
			'@typescript-eslint/no-extraneous-class': ['error'],

			// Using explicit types when they can be inferred
			// '@typescript-eslint/no-inferrable-types': ['error', ],

			// Messing up "new" and "constructor" keywords (using one when the other should be used)
			'@typescript-eslint/no-misused-new': ['error'],

			// Using use ! and ?? together a! ?? b
			'@typescript-eslint/no-non-null-asserted-nullish-coalescing': ['error'],

			// Using ? then !, a?.b!
			'@typescript-eslint/no-non-null-asserted-optional-chain': ['error'],

			// Defining a type twice, use const instead
			// let foo = <'bar'>'bar';
			'@typescript-eslint/prefer-as-const': ['error'],

			// Enums must have an explicit value, not implicit
			'@typescript-eslint/prefer-enum-initializers': ['error'],

			// for (let i = ) loops -> for (const i of ) instead
			// UNLESS the index is used -- if the index is used, it won't error.
			'@typescript-eslint/prefer-for-of': ['error'],

			// Require more explicit function declarations (function foo(example: () => number): number {
			'@typescript-eslint/prefer-function-type': ['error'],

			// Enums must use literal values
			// Enums use their own scope, which can make the result unexpected
			'@typescript-eslint/prefer-literal-enum-member': ['error'],

			// Use @ts-expect-error instead of @ts-ignore
			'@typescript-eslint/prefer-ts-expect-error': ['error'],

			// Disabled rules for dev, but required for prod (should be ran on-commit)
			// Disabled rules for dev, but required for prod (should be ran on-commit)
			// Disabled rules for dev, but required for prod (should be ran on-commit)

			// Require records, instead of interfaces, or vice versa
			'@typescript-eslint/consistent-indexed-object-style': commit ? ['error'] : ['off'],

			// Empty interface
			'@typescript-eslint/no-empty-interface': commit ? ['error'] : ['off'],

			// Disallow namespaces
			'@typescript-eslint/no-namespace': commit ? ['error'] : ['off'],

			// No using functions without code inside them -- Simply unnecessary and annoying.
			'@typescript-eslint/no-empty-function': commit ? ['error'] : ['off'],

			'@typescript-eslint/no-var-requires': commit ? ['error'] : ['off'],

			//. @ts-expect-error -- If we want to ignore an ESLint error, we have a reason for it.
			'@typescript-eslint/ban-ts-comment': commit ? ['error'] : ['off'],

			// Will complain if we use "let" and don't reassign the value. (Useful for dev).
			'@typescript-eslint/prefer-const': ['off'],

			// Empty functions - Useful for "future" functions, or for when dev testing.
			'@typescript-eslint/no-empty': ['off'],

			// const notNull = maybeNull!
			'@typescript-eslint/no-non-null-assertion': ['off'],

			// Use imports, not require
			// '@typescript-eslint/no-require-imports': ['error', ],

			// const thisIsVoid = alert('hi'); // Alert returns "void"
			'@typescript-eslint/no-confusing-void-expression': ['error'],

			// No meaningless void (not storing the variable)
			'@typescript-eslint/no-meaningless-void-operator': ['error'],

			// type UnionBooleanLiteral = boolean | false;
			'@typescript-eslint/no-redundant-type-constituents': ['error'],

			// if (aBoolean === true)
			'@typescript-eslint/no-unnecessary-boolean-literal-compare': ['error'],

			// const foo = 'hi'!;
			'@typescript-eslint/no-unnecessary-type-assertion': ['error'],

			// when "as" can become a "!" (preferred)
			'@typescript-eslint/non-nullable-type-assertion-style': ['error'],

			// replace .indexOf(-1) with .includes()
			'@typescript-eslint/prefer-includes': ['error'],

			// When using .reduce(), prefer a type paramater > as cast
			'@typescript-eslint/prefer-reduce-type-parameter': ['error'],

			// Prefer .startsWith(), as opposed to a slice at the start, charAt(0), substring, etc
			'@typescript-eslint/prefer-string-starts-ends-with': ['error'],

			// If a function returns a Promise, it must be an async function
			'@typescript-eslint/promise-function-async': ['error'],

			// When sorting an array, use .localeCompare()
			// in ECMA spec, .sort() converts the values to strings, and sorts them alphabetically (1, 2, )
			'@typescript-eslint/require-array-sort-compare': ['error', { ignoreStringArrays: true }],

			// Don't use + to concatenate different types
			'@typescript-eslint/restrict-plus-operands': ['error'],

			// If inputting a type union into a switch, make sure we check/handle every potential union type
			'@typescript-eslint/switch-exhaustiveness-check': ['error'],

			'@typescript-eslint/unbound-method': ['error'],

			'@typescript-eslint/no-misused-promises': ['error'],

			// An enum with two properties, that have the same value
			'@typescript-eslint/no-duplicate-enum-values': ['off'],

			'@typescript-eslint/no-floating-promises': [
				'error',
				{
					ignoreVoid: true,
					ignoreIIFE: true,
				},
			],

			// Don't "await" a non-async function
			'@typescript-eslint/await-thenable': ['error'],

			// don't use ts-lint:disable (because this is not TSLint)
			'@typescript-eslint/ban-tslint-comment': ['error'],

			// When using New Set/Map, prefer arguments on the left side, or right
			'@typescript-eslint/consistent-generic-constructors': ['error'],

			// "<foo>" vs "as foo"
			'@typescript-eslint/consistent-type-assertions': [
				'error',
				{
					assertionStyle: 'as',
				},
			],

			// When exporting a type (as opposed to runtime code), use "export type"
			'@typescript-eslint/consistent-type-exports': ['error', { fixMixedExportsWithInlineTypeSpecifier: true }],

			// Any optional properties must be at the end of the argument array
			'@typescript-eslint/default-param-last': ['error'],

			// "new Array(1, 2, 3)" -> new Array<number>(0, 1, 2)
			'@typescript-eslint/no-array-constructor': ['error'],

			// Calling console.log() on an object calls object.toString().
			// This errors if we call console.log() on an object that does not have a toString() method. (which returns [object Object])
			'@typescript-eslint/no-base-to-string': ['error'],
			'@typescript-eslint/restrict-template-expressions': ['error', { allowAny: true, allowNumber: true, allowBoolean: true, allowNullish: true }], // Seems to be same as above, but for template literals

			// Classes with two+ of the same name (two getters name "foo")
			'@typescript-eslint/no-dupe-class-members': ['error'],

			// disallow console.log *in production only*, but allow other console methods (console.info, console.error, etc)
			'no-console': ['error', { allow: ['info', 'warn', 'error', 'debug', 'trace', commit ? 'N/A this is ignored' : 'log'] }],

			// Only one import per file -- the autofix for this does not seem to work
			'import/no-duplicates': [
				'off',
				// 'error',
				// {
				// 	'prefer-inline': true,
				// 	considerQueryString: true,
				// },
			],

			'import/extensions': [
				'error',
				'never',
				{
					pattern: {
						// 'json': 'always'
					},
				},
			],

			// Don't use for *in* loops on arrays, use for *of*
			'@typescript-eslint/no-for-in-array': ['error'],

			// Implied eval from Function, setTimeout, setInterval, setImmediate, or execScript
			'@typescript-eslint/no-implied-eval': ['error'],

			// Imports with side effects that may be removed upon transpilation
			'@typescript-eslint/no-import-type-side-effects': ['error'],

			// "this" in cases where is it not applicable
			'@typescript-eslint/no-invalid-this': ['error'],

			// Variables (and other stuff?) being void
			'@typescript-eslint/no-invalid-void-type': ['error'],

			// Confusing/unexpected for loop variables (primarily, using "var" in a loop does really weird stuff)
			'@typescript-eslint/no-loop-func': ['error'],

			// Literal numbers that lose precision
			'@typescript-eslint/no-loss-of-precision': ['error'],

			// Certain imports (e.g fs in the frontend).
			'@typescript-eslint/no-restricted-imports': [
				'off',
				{
					paths: [
						// 	{
						// 		name: 'fs',
						// 		message: 'FS is not allowed in React',
						// 	},
					],
				},
			],

			// If the variable "foo" is declared in file scope, this stops a function from also declaring a local variable named "foo"
			'@typescript-eslint/no-shadow': ['error'],

			// An enum property can reference a property in the same enum. This rule errors with an unnecessary qualifier
			'@typescript-eslint/no-unnecessary-qualifier': ['error'],

			// Using an interface/class with the same name will merge them, which is confusing.
			'@typescript-eslint/no-unsafe-declaration-merging': ['error'],

			// Weird enum comparisons (enum === number)
			'@typescript-eslint/no-unsafe-enum-comparison': ['error'],

			// Useless expressions that don't do anything, e.g "x + 1"
			'@typescript-eslint/no-unused-expressions': ['error'],

			// Referencing variables before they are defined/initialized
			'@typescript-eslint/no-use-before-define': ['error'],

			// Empty constructors in a class
			// I think an empty constructor looks cleaner (all classes should have a constructor IMO)
			'@typescript-eslint/no-useless-constructor': ['off'],

			// Exporting an empty object (will not error if the file is not a module, THEN we want to export an empty object to turn it into a module)
			'@typescript-eslint/no-useless-empty-export': ['error'],

			// Modules are legacy, rename them to namespaces
			'@typescript-eslint/prefer-namespace-keyword': ['error'],

			// Replace || with ?? when possible
			'@typescript-eslint/prefer-nullish-coalescing': ['error'],

			// foo && foo.a -> foo?.a
			'@typescript-eslint/prefer-optional-chain': ['error'],

			// String.match -> String.exec (for regexes) (it's slightly faster, and adds consistency)
			'@typescript-eslint/prefer-regexp-exec': ['error'],

			// In a function, return an awaited Promise, instead of the promise
			'@typescript-eslint/return-await': ['error'],

			// Because 0 == false, if we have a number "if (num)", it can be false if the number is 0.
			'@typescript-eslint/strict-boolean-expressions': [
				'error',
				{
					// true = we don't use this rule
					allowNullableObject: true,
					allowAny: true,
				},
			],

			//     /// <reference path="foo" />
			'@typescript-eslint/triple-slash-reference': ['error'],

			// Multiple function overloads that can be comdensed into less
			'@typescript-eslint/unified-signatures': ['error'],

			// - - - - - - - - - - Prettier should handle these - - - - - - - - - -
			// - - - - - - - - - - Prettier should handle these - - - - - - - - - -
			// - - - - - - - - - - Prettier should handle these - - - - - - - - - -

			'@typescript-eslint/semi': ['off'],
			'@typescript-eslint/quotes': ['off'],
			'@typescript-eslint/indent': ['off'],
			'@typescript-eslint/allowIndentationTabs': ['off'],
			'@typescript-eslint/no-mixed-spaces-and-tabs': ['off'],
			'@typescript-eslint/no-extra-semi': ['off'],
			'@typescript-eslint/no-trailing-spaces': ['off'],
			'@typescript-eslint/comma-dangle': ['off'],
			'@typescript-eslint/comma-spacing': ['off'],
			'@typescript-eslint/func-call-spacing': ['off'],
			'@typescript-eslint/key-spacing': ['off'],
			'@typescript-eslint/keyword-spacing': ['off'],
			'@typescript-eslint/lines-around-comment': ['off'],
			'@typescript-eslint/lines-between-class-members': ['off'],
			'@typescript-eslint/member-delimiter-style': ['off'],
			'@typescript-eslint/no-extra-parens': ['off'],
			'@typescript-eslint/object-curly-spacing': ['off'],
			'@typescript-eslint/padding-line-between-statements': ['off'],
			'@typescript-eslint/space-before-blocks': ['off'],
			'@typescript-eslint/space-before-function-paren': ['off'],
			'@typescript-eslint/space-infix-ops': ['off'],
			'@typescript-eslint/type-annotation-spacing': ['off'],
			'@typescript-eslint/block-spacing': ['off'],

			// - - - - - - - - - - Experimental (should be revisited in the future, likely to change) - - - - - - - - - -
			// - - - - - - - - - - Experimental (should be revisited in the future, likely to change) - - - - - - - - - -
			// - - - - - - - - - - Experimental (should be revisited in the future, likely to change) - - - - - - - - - -

			// lol
			// "0" is not camelcase (needed in NonEmptyArray<T>)
			'@typescript-eslint/naming-convention': ['off'],

			// Some NPM packages (which may be used by JS users) prefer using Getters in a class, instead of readonly.
			// This does not have a giant benefit either way (that I can see)
			'@typescript-eslint/class-literal-property-style': ['error'],

			// let notYetAssigned: string;
			// If we are doing this, we have a reason for it.
			'@typescript-eslint/init-declarations': ['off'],

			// Sort how fields, methods, and constructors are ordered.
			'@typescript-eslint/member-ordering': ['error'],

			// in interfaces, which one is preferred?
			// func(arg: string): number;
			// func: (arg: string) => number;
			'@typescript-eslint/method-signature-style': ['error'],

			// No deleting dynamically generates properties from objects
			'@typescript-eslint/no-dynamic-delete': ['error'],

			// All numbers must be constants (so they are explained)
			// ...no
			'@typescript-eslint/no-magic-numbers': ['off'],

			// Don't allow enums with numbers AND strings (should be one type, not multiple)
			'@typescript-eslint/no-mixed-enums': ['error'],

			// No type aliases
			// This does not work with z.infer<> from Zod
			'@typescript-eslint/no-type-alias': ['off'],

			// Don't allow unnecessary if statements (We use these a lot to be 100% certain, so this is disabled)
			'@typescript-eslint/no-unnecessary-condition': ['off'],

			// In class constructors, readonly/private/protected/public in parameters
			'@typescript-eslint/parameter-properties': ['error'],

			// In a constructor, require members to be "readonly" if they are not modified outside
			'@typescript-eslint/prefer-readonly': ['error'],

			// Prefer readonly parameters
			// This will likely be disabled in the future, but I want to get into the habit of using readonly parameters.
			'@typescript-eslint/prefer-readonly-parameter-types': ['off'],

			// Class functions that return the instanceof the class must return "this"
			'@typescript-eslint/prefer-return-this-type': ['error'],

			// Sort types with & and | alphabetically
			'@typescript-eslint/sort-type-constituents': ['error'],

			// Extra type annotations (e.g "let x: number = 0")
			'@typescript-eslint/typedef': ['error'],

			// Don't assign "this" to variables
			'@typescript-eslint/no-this-alias': ['error'],

			// - - - - - - - - - - <Any> based rules - - - - - - - - - -
			// - - - - - - - - - - <Any> based rules - - - - - - - - - -
			// - - - - - - - - - - <Any> based rules - - - - - - - - - -

			// Checking properties of objects with "any", e.g "foo.bar" when foo is "any"
			'@typescript-eslint/no-unsafe-member-access': ['off'],

			// MANUAL any -- If we are manually specifying "any", we have a reason for it.
			'@typescript-eslint/no-explicit-any': ['off'],

			// Don't extend *any* types (explicit <T> already extends any)
			'@typescript-eslint/no-unnecessary-type-constraint': ['off'],

			// Using <any> as a type assertion
			'@typescript-eslint/no-unsafe-assignment': ['off'],

			// Calling any functions that are typed as "any"
			'@typescript-eslint/no-unsafe-call': ['off'],

			// Passing in <any> as a type argument
			'@typescript-eslint/no-unsafe-argument': ['off'],

			// - - - - - - - - - - I don't understand what these do - - - - - - - - - -
			// - - - - - - - - - - I don't understand what these do - - - - - - - - - -
			// - - - - - - - - - - I don't understand what these do - - - - - - - - - -

			// // https://typescript-eslint.io/rules/dot-notation
			'@typescript-eslint/dot-notation': ['error'],

			// https://typescript-eslint.io/rules/explicit-member-accessibility
			'@typescript-eslint/explicit-member-accessibility': ['error'],

			// https://typescript-eslint.io/rules/no-unnecessary-type-arguments
			'@typescript-eslint/no-unnecessary-type-arguments': ['error'],

			// - - - - - - - - - - Deprecated - - - - - - - - - -
			// - - - - - - - - - - Deprecated - - - - - - - - - -
			// - - - - - - - - - - Deprecated - - - - - - - - - -

			'@typescript-eslint/no-duplicate-imports': ['off'],
			'@typescript-eslint/no-implicit-any-catch': ['off'],
			'@typescript-eslint/no-parameter-properties': ['off'],
			'@typescript-eslint/sort-type-union-intersection-members': ['off'], // Renamed to "sort-type-constituents"
			// '@typescript-eslint/camelcase': ['off'], // Not a TypeScript rule

			// - - - - - - - - - - To be looked at in the future (bug reports) - - - - - - - - - -
			// - - - - - - - - - - To be looked at in the future (bug reports) - - - - - - - - - -
			// - - - - - - - - - - To be looked at in the future (bug reports) - - - - - - - - - -

			// 'import/no-unresolved': ['error', ],
			// Very slow: https://github.com/import-js/eslint-plugin-import/issues/2348

			// - - - - - - - - - - Package-based rules - - - - - - - - - -
			// - - - - - - - - - - Package-based rules - - - - - - - - - -
			// - - - - - - - - - - Package-based rules - - - - - - - - - -

			// no-unused-vars stuff
			// no-unused-vars must be off, as these do that rule but better (with autofixing)
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['off'], // I'm not sure if this rule has to be off as well, but we will leave it off to be safe.
			'unused-imports/no-unused-imports': commit ? 'error' : 'off',
			'unused-imports/no-unused-vars': commit ? ['error', { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' }] : 'off',
			// '@typescript-eslint/no-unused-vars': ['error', { vars: 'all', args: 'none', ignoreRestSiblings: false }],

			// // Import stuff
			// 'simple-import-sort/imports': 'error',
			// 'simple-import-sort/exports': 'error',

			// // These have seemingly been removed from TypeScript-ESLint? But they're still in the Documentation...
			// // "throw 'text'" statements, must always throw new Error()
			// '@typescript-eslint/no-throw-literal': ['error'],
			// // Bracing indentation (new line, or current line)
			// '@typescript-eslint/brace-style': ['error'],
			// // Disallow the "bad" default types, e.g "String", "Boolean", "Number", "Function"
			// '@typescript-eslint/ban-types': ['error'],
		},
	}
);
