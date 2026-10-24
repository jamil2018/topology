# `@topology/jest`

Thin Jest reporter that builds Topology's ExecutionReport JSON and POSTs it to `/api/executions`.

## Usage

```js
// jest.config.js / jest.config.ts
export default {
  reporters: ["default", ["@topology/jest", { intentFromTitle: true }]],
};
```

The package is ESM TypeScript (same as `@topology/playwright`). Jest 29+ with ESM, or a TypeScript Jest config, can load it. Optional options: `{ dryRun: true, url, apiToken }`.

## Env

| Variable | Required | Description |
| --- | --- | --- |
| `TOPOLOGY_URL` | no | Base URL (default `http://127.0.0.1:4317`) |
| `TOPOLOGY_API_TOKEN` | yes* | Bearer token for `/api/executions` |
| `TOPOLOGY_DRY_RUN` | no | `1` / `true` — build report, skip upload |

\*Not required when `dryRun` / `TOPOLOGY_DRY_RUN` is set.

Each assertion becomes a protocol result with `externalKey` `file::title path`. Title prefixes like `AUTH-001: login` set `intentKey`.
