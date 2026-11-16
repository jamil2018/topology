import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts", "./tests/integration/setup.ts"],
    include: [
      "tests/integration/**/*.integration.test.ts",
      "src/**/*.integration.test.ts",
      "packages/*/src/**/*.integration.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/.worktrees/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    // Route glob imports load next-auth as native ESM. Node cannot resolve
    // extensionless `next/server` from that package. Inline it so Vite resolves
    // the subpath the same way static route imports already do.
    server: {
      deps: {
        inline: ["next-auth"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@topology/domain/client": path.resolve(__dirname, "./packages/domain/src/client.ts"),
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
