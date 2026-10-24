# `@topology/cli`

Command-line client for a self-hosted [Topology](https://github.com/jamil2018/topology) instance.

```bash
npm install --global @topology/cli
# or: npx @topology/cli
```

## Env

| Variable | Required | Description |
| --- | --- | --- |
| `TOPOLOGY_URL` | no | Base URL (default `http://127.0.0.1:4317`) |
| `TOPOLOGY_API_TOKEN` | yes | Bearer token for `/api/ci/*`, `/api/executions`, `/api/query`, … |

## Commands

```
topology junit submit <file> [--run-id <id>] [--name <name>] [--source github|jenkins|gitlab|cli]
topology run upload <file.json>
topology runs create --name <name> [--source github|jenkins|gitlab|cli] [--branch <b>] [--sha <sha>] [--pr <n>] [--shards <n>]
topology runs submit-thread --run-id <id> --shard <i> --file <junit.xml>
topology runs complete --run-id <id>
topology affected (--commit <sha> | --pr <n> | --path <p>...)
topology coverage [filter]
topology query '<dsl>'
```

JSON execution protocol: `topology run upload report.json` (see `docs/plugins.md` in the repo).

CI examples live in [`examples/`](./examples/).
