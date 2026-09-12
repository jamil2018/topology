# @topology/mcp

MCP agent plugin for self-hosted [Topology](https://github.com/jamil2018/topology).

## Env

| Variable | Description |
| --- | --- |
| `TOPOLOGY_URL` | Base URL of your Topology instance (e.g. `http://127.0.0.1:4317`) |
| `TOPOLOGY_API_TOKEN` | Bearer token (`TOPOLOGY_API_TOKEN` in server `.env.local`, or a row in `api_tokens`) |

## Tools

- `list_cases` / `create_case`
- `list_runs` / `create_run`
- `list_results` / `record_result`
- `whats_pending`
- `get_scenario_context`
- `create_issue` / `link_issue`

## Cursor

Add to MCP settings (or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "topology": {
      "command": "npx",
      "args": ["-y", "@topology/mcp"],
      "env": {
        "TOPOLOGY_URL": "http://127.0.0.1:4317",
        "TOPOLOGY_API_TOKEN": "topo_your_api_token"
      }
    }
  }
}
```

Local monorepo alternative:

```json
{
  "mcpServers": {
    "topology": {
      "command": "npx",
      "args": ["tsx", "packages/mcp/src/server.ts"],
      "cwd": "/absolute/path/to/topology",
      "env": {
        "TOPOLOGY_URL": "http://127.0.0.1:4317",
        "TOPOLOGY_API_TOKEN": "topo_your_api_token"
      }
    }
  }
}
```

## Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "topology": {
      "command": "npx",
      "args": ["-y", "@topology/mcp"],
      "env": {
        "TOPOLOGY_URL": "http://127.0.0.1:4317",
        "TOPOLOGY_API_TOKEN": "topo_your_api_token"
      }
    }
  }
}
```

## Codex / other MCP hosts

```bash
export TOPOLOGY_URL=http://127.0.0.1:4317
export TOPOLOGY_API_TOKEN=topo_your_api_token
npx -y @topology/mcp
```

Or from this repo:

```bash
npm run start --workspace=@topology/mcp
```

Topology UI has **Connect an agent** under [Settings → Connections](/settings?section=connections) (`/connect` redirects there) with a copyable snippet.
