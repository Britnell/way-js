import { defineConfig } from "vite";
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        test: "test.html",
        todo: "todo.html",
      },
    },
  },
});
