const modules = new Map();
const define = (name, moduleFactory) => {
	modules.set(name, moduleFactory);
};

const moduleCache = new Map();
const requireModule = (name) => {
	// If this module has already been executed,
	// return a reference to it.
	if (moduleCache.has(name)) {
		return moduleCache.get(name).exports;
	}

	// Throw if the module doesn't exist.
	if (!modules.has(name)) {
		throw new Error(`Module '${name}' does not exist.`);
	}

	const moduleFactory = modules.get(name);
	// Create a module object.
	const module = {
		exports: {},
	};
	// Set the moduleCache immediately so that we do not
	// run into infinite loops with circular dependencies.
	moduleCache.set(name, module);
	// Execute the module factory. It will likely mutate the `module` object.
	moduleFactory(module, module.exports, requireModule);
	// Return the exported data.
	return module.exports;
};

define(5, function(module, exports, require) {
"use strict";

module.exports = 'tomato';});
define(4, function(module, exports, require) {
"use strict";

module.exports = 'melon';});
define(3, function(module, exports, require) {
"use strict";

module.exports = 'kiwi ' + require(4) + ' ' + require(5);});
define(2, function(module, exports, require) {
"use strict";

module.exports = 'banana ' + require(3);});
define(1, function(module, exports, require) {
"use strict";

module.exports = 'apple ' + require(2) + ' ' + require(3);});
define(0, function(module, exports, require) {
"use strict";

console.log(require(1)); // console.log(require('./banana'));});
requireModule(0);