import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";

const sdPlugin = "com.hoowan.obsidian.sdPlugin";

export default {
	input: "src/plugin.js",
	output: { file: `${sdPlugin}/bin/plugin.js`, format: "es", sourcemap: true },
	plugins: [nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }), commonjs()],
};
