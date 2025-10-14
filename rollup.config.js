import { defineConfig } from "rollup";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

export default defineConfig({
  input: "src/way.ts",
  output: {
    file: "way.min.js",
    format: "iife",
    name: "wayjs",
    sourcemap: false,
  },
  plugins: [typescript(), terser()],
  external: [],
});
