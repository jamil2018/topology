# `@topology/cypress`

Thin Cypress plugin that builds Topology's ExecutionReport JSON and POSTs it to `/api/executions` on `after:run`.

## Usage

```ts
// cypress.config.ts
import { defineConfig } from "cypress";
import { topologyCypressPlugin } from "@topology/cypress";

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      topologyCypressPlugin(on, config);
      return config;
    },
  },
});
```

Optional third argument: `{ dryRun: true, intentFromTitle: true, url, apiToken }`.

## Env

| Variable | Required | Description |
| --- | --- | --- |
| `TOPOLOGY_URL` | no | Base URL (default `http://127.0.0.1:4317`) |
| `TOPOLOGY_API_TOKEN` | yes* | Bearer token for `/api/executions` |
| `TOPOLOGY_DRY_RUN` | no | `1` / `true` — build report, skip upload |

\*Not required when `dryRun` / `TOPOLOGY_DRY_RUN` is set.

Each Cypress test becomes a protocol result with `externalKey` `spec::title path`. Title prefixes like `AUTH-001: login` set `intentKey`. Screenshots on the spec are attached as screenshot artifacts.
