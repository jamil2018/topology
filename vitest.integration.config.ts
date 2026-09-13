import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "tests/integration/**/*.integration.test.ts",
      "src/**/*.integration.test.ts",
      "packages/*/src/**/*.integration.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/.worktrees/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@topology/domain": path.resolve(
        __dirname,
        "./packages/domain/src/index.ts",
      ),
      "@topology/issue-providers": path.resolve(
        __dirname,
        "./packages/issue-providers/src/index.ts",
      ),
      "@topology/mcp": path.resolve(__dirname, "./packages/mcp/src/index.ts"),
    },
  },
});
