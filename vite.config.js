import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import includeHtml from "vite-plugin-include-html";

export default defineConfig({
  plugins: [tailwindcss(), includeHtml()],
  base: "/way-js/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        demo: "demo.html",
        blog: "blog.html",
        todo: "todo.html",
        script: "script.html",
        quiet: "quiet.html",
        awesome: "awesome.html",
        npm: "npm.html",
        filecomp: "filecomp.html",
      },
    },
  },
});
