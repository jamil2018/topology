import { defineConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
    ],
    exclude: [
      "**/*.integration.test.ts",
      "**/node_modules/**",
      "**/.worktrees/**",
    ],
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
      "@topology/playwright": path.resolve(
        __dirname,
        "./packages/playwright-reporter/src/index.ts",
      ),
    },
  },
});
