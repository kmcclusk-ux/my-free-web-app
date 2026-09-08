import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const frontendNodeModules = fileURLToPath(new URL("../frontend/node_modules/", import.meta.url));

export default defineConfig({
  base: "./",
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".json"],
    alias: {
      react: `${frontendNodeModules}react`,
      "react-dom/client": `${frontendNodeModules}react-dom/client`,
      "react/jsx-runtime": `${frontendNodeModules}react/jsx-runtime`,
    },
  },
});
