# `@topology/playwright`

Thin Playwright reporter that builds Topology's [ExecutionReport](../domain/src/execution-protocol.ts) JSON and POSTs it to `/api/executions`.

## Usage

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [["@topology/playwright"], ["list"]],
});
```

Optional options: `["@topology/playwright", { dryRun: true, intentFromTitle: true }]`.

## Env

| Variable | Required | Description |
| --- | --- | --- |
| `TOPOLOGY_URL` | no | Base URL (default `http://127.0.0.1:4317`) |
| `TOPOLOGY_API_TOKEN` | yes* | Bearer token for `/api/executions` |
| `TOPOLOGY_DRY_RUN` | no | `1` / `true` — build report, skip upload |
| `TOPOLOGY_COMMIT_SHA` | no | Run metadata (falls back to `GITHUB_SHA`) |
| `TOPOLOGY_BRANCH` | no | Run metadata (falls back to `GITHUB_REF_NAME`) |
| `TOPOLOGY_RUN_EXTERNAL_ID` | no | Run metadata (falls back to `GITHUB_RUN_ID`) |

\*Not required when `dryRun` / `TOPOLOGY_DRY_RUN` is set.

## Intent / external key mapping

Each test result needs `intentKey` and/or `externalKey` (protocol requirement).

1. **Annotation** (preferred): `test.info().annotations.push({ type: "intentKey", description: "AUTH-001" })`  
   Also accepts `topology.intentKey`, `externalKey`, `topology.externalKey`.
2. **Title prefix**: `AUTH-001: login` or `[AUTH-001] login` → `intentKey` (disable with `intentFromTitle: false`).
3. **Fallback `externalKey`**: `<relativeFile>::<title path>` (e.g. `e2e/auth.spec.ts::suite › login`).

CLI equivalent: `topology run upload report.json`.
