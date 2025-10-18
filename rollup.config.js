import { defineConfig } from "rollup";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";
import { nodeResolve } from "@rollup/plugin-node-resolve";

export default defineConfig({
  input: "src/way.ts",
  output: {
    file: "src/way.min.js",
    format: "iife",
    name: "wayjs",
    sourcemap: false,
  },
  plugins: [nodeResolve(), typescript(), terser()],
  external: [],
});
