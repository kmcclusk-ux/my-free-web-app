const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    fileParallelism: false,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
