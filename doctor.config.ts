import { defineConfig } from "react-doctor/api";

/**
 * React Doctor config for Topology (Next.js App Router + React 19 + HeroUI).
 * Scans app source under src/; advisory locally (blocking none).
 */
export default defineConfig({
  rootDir: "src",
  // Local `npm run react-doctor` is advisory; CI can override with --blocking.
  blocking: "none",
  // Focus on React source health; dependency Socket checks are separate.
  supplyChain: {
    enabled: false,
  },
  ignore: {
    // Vitest / UI test files — default surfaces already de-emphasize tests;
    // exclude them from the scan corpus to cut noise.
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/test/**",
    ],
    // Design-system styling rules are noisy with HeroUI / custom topo-* UI.
    tags: ["design"],
  },
  // NextAuth `auth()` plus Topology access guards used in server routes/actions.
  serverAuthFunctionNames: [
    "auth",
    "authenticateCiRequest",
    "authorizeCoverageSnapshotAccess",
    "authorizeNotificationsAccess",
    "authorizeReleaseRead",
    "requireImportAccess",
    "requireProjectAccess",
    "requireWorkspaceAssignee",
  ],
});
