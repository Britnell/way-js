import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  base: "/way-js/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        demo: "demo.html",
        todo: "todo.html",
      },
    },
  },
});
