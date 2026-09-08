const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  resolve: { extensions: [".ts", ".tsx", ".mjs", ".js", ".json"] },
  test: {
    fileParallelism: false,
    pool: "threads",
    maxWorkers: 1,
    exclude: ["**/node_modules/**", "**/dist/**", "**/tmp/**", "**/backup/**"],
  },
});
