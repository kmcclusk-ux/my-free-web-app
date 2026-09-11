import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".json"],
  },
});
