import { defineConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts", "./vitest.ui.setup.ts"],
    include: ["src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.worktrees/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@topology/domain": path.resolve(
        __dirname,
        "./packages/domain/src/index.ts",
      ),
    },
  },
});
