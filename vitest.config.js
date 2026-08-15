const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    fileParallelism: false,
    pool: "threads",
    maxWorkers: 1,
    exclude: ["**/node_modules/**", "**/dist/**", "**/tmp/**", "**/backup/**"],
  },
});
