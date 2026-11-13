import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";

const sdPlugin = "com.hoowan.topping.sdPlugin";

export default {
	input: "src/plugin.js",
	output: { file: `${sdPlugin}/bin/plugin.js`, format: "es", sourcemap: true },
	// node-hid is a native addon: it can't be bundled, so it's loaded at runtime from ../node_modules.
	external: ["node-hid"],
	plugins: [nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }), commonjs()],
};
