import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    pool: 'forks',
    setupFiles: [
      //    './src/test/setup.ts'
    ],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": new URL('./src/', import.meta.url).pathname,
    },
  },
});
