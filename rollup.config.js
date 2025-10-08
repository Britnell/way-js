import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default defineConfig({
  input: 'src/framework.ts',
  output: {
    file: 'framework.min.js',
    format: 'iife',
    name: 'Framework',
    sourcemap: false,
  },
  plugins: [typescript(), terser()],
  external: [],
});
