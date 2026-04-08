import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Most tests are pure functions; the few that touch the DOM use happy-dom
    // via per-file `// @vitest-environment happy-dom` directives.
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/api/**/*.test.ts"],
    exclude: ["node_modules", "tests/e2e/**", "tests/load/**"],
    // Integration tests launch real Puppeteer — give them headroom.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Run tests serially within a file by default to avoid Puppeteer / queue
    // race conditions across cases. Different files still run in parallel.
    sequence: { concurrent: false },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.d.ts", "lib/data/baymard-scrape.jsonl"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
