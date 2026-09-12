import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "packages/*/src/**/*.test.ts",
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
    },
  },
});
