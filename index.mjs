import JestHasteMap from 'jest-haste-map';
import { cpus } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { resolve } from 'path';
import chalk from 'chalk';
import yargs from 'yargs';

import Resolver from 'jest-resolve';
import { DependencyResolver } from 'jest-resolve-dependencies';

import fs from 'fs';

import { Worker } from 'jest-worker';

// Get the root path to our project (Like `__dirname`).
const root = join(dirname(fileURLToPath(import.meta.url)), 'product');
console.log('Root folder : ', root);

// Most JavaScript tooling operates on all the code in your project, and `jest-haste-map`
// is an efficient way to keep track of all files, analyze relationships between them and keep monitoring the file system for changes:

const hasteMapOptions = {
	extensions: ['js'],
	maxWorkers: cpus().length,
	name: 'jest-bundler',
	platforms: [],
	rootDir: root,
	roots: [root],
};
const hasteMap = new JestHasteMap.default(hasteMapOptions);
await hasteMap.setupCachePath(hasteMapOptions);
const { hasteFS, moduleMap } = await hasteMap.build();
console.log('List of all files in root folder : ', hasteFS.getAllFiles());
// ['/path/to/product/apple.js', '/path/to/product/banana.js', …]

// Let’s make use of `yargs` to add an `--entry-point` option so we can tell our bundler where to start bundling from.
// Extracting entry file
const options = yargs(process.argv).argv;
const entryPoint = resolve(process.cwd(), options.entryPoint);
if (!hasteFS.exists(entryPoint)) {
	throw new Error('`--entry-point` does not exist. Please provide a path to a valid file.');
}

console.log(chalk.bold(`❯ Extract entry point : ${entryPoint} ${chalk.blue(options.entryPoint)}`));
// console.log(hasteFS.getDependencies(entryPoint)); --> It is relative path
// ['./apple.js']

// using dependency resolver to get absolute path.

// With this solution we can now retrieve the full file paths of each module that our entry point
// depends on. We’ll need to process each dependency once to create the full dependency graph
const resolver = new Resolver.default(moduleMap, {
	extensions: ['.js'],
	hasCoreModules: false,
	rootDir: root,
});
const dependencyResolver = new DependencyResolver(resolver, hasteFS);
console.log('Entry point dependencies : ', dependencyResolver.resolve(entryPoint));

// Now its time to create module graph : seen(allFiles)

// We now have all the necessary information to “serialize” our bundle.
// Serialization is the process of taking the dependency information and all code to turn it
// into a bundle that we can be run as a single file in a browser.

const seen = new Set();
const modules = new Map();
const queue = [entryPoint];
let id = 0;
while (queue.length) {
	const module = queue.shift();
	// Ensure we process each module at most once
	// to guard for cycles.
	if (seen.has(module)) {
		continue;
	}

	seen.add(module);
	// Resolve each dependency and store it based on their "name",
	// that is the actual occurrence in code via `require('<name>');`.
	const dependencyMap = new Map(
		hasteFS.getDependencies(module).map((dependencyName) => [dependencyName, resolver.resolveModule(module, dependencyName)])
	);

	const code = fs.readFileSync(module, 'utf8');

	const metadata = {
		// Assign a unique id to each module.
		id: id++,
		code: code,
		dependencyMap,
	};
	modules.set(module, metadata);
	queue.push(...dependencyMap.values());
}

console.log(chalk.bold(`❯ Found ${chalk.blue(seen.size)} files`));
console.log('Order of require of file', Array.from(seen));
console.log(chalk.redBright('Unresolved module map'), [...modules]);

// Wrap modules with `define(<id>, function(module, exports, require) { <code> });`
const wrapModule = (id, code) => `define(${id}, function(module, exports, require) {\n${code}});`;

const worker = new Worker(join(dirname(fileURLToPath(import.meta.url)), 'worker.js'), {
	enableWorkerThreads: true,
});

// Go through each module (backwards, to process the entry-point last).
const results = await Promise.all(
	Array.from(modules)
		.reverse()
		.map(async ([module, metadata]) => {
			let { id, code, dependencyMap } = metadata;
			({ code } = await worker.transformFile(code));
			for (const [dependencyName, dependencyPath] of dependencyMap) {
				const dependency = modules.get(dependencyPath);
				code = code.replace(
					new RegExp(`require\\(('|")${dependencyName.replace(/[\/.]/g, '\\$&')}\\1\\)`),
					`require(${dependency.id})`
				);
			}
			return wrapModule(id, code);
		})
);

// we just built rollup.js, a _compiler that inlines modules

const output = [fs.readFileSync('./require.js', 'utf8'), ...results, 'requireModule(0);'].join('\n');

console.log(output);

if (options.output) {
	fs.writeFileSync(options.output, output, 'utf8');
}

worker.end();
