import { defineConfig } from "vite";

export default defineConfig({
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
