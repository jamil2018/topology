# @topology/mcp

MCP agent plugin for self-hosted [Topology](https://github.com/jamil2018/topology). Agents call the same Bearer-authenticated agent REST API as the UI; **graph writes from AI go through human-gated proposals** (`propose_coverage`), never silent catalog mutations.

## Env

| Variable | Description |
| --- | --- |
| `TOPOLOGY_URL` | Base URL of your Topology instance (e.g. `http://127.0.0.1:4317`) |
| `TOPOLOGY_API_TOKEN` | Bearer token with the `agent` scope (`Settings → Security` API tokens, or `TOPOLOGY_API_TOKEN` in server `.env.local` when env bypass is enabled) |

## Tools

### Daily QA

| Tool | Description |
| --- | --- |
| `list_cases` | List or search test cases |
| `create_case` | Create a test case |
| `list_runs` | List recent test runs |
| `create_run` | Create a run from case IDs or keys |
| `list_results` | List results, optionally by run or status |
| `record_result` | Record pass / fail / block / skip for a case in a run |
| `whats_pending` | Hub pending work: untested results, failures without issues, retest queue |
| `get_scenario_context` | Aggregate cases, recent results, open issues, and latest runs for a query |
| `get_failure_evidence` | Failure notes, error, stack, attachments, and signature for a result or signature id |
| `create_issue` | Create a tracker issue from a failed/blocked result |
| `link_issue` | Link an existing tracker issue to a result |

### Graph / Impact

| Tool | Description |
| --- | --- |
| `list_intents` | List or search test intents |
| `get_test_intent` | Get a test intent by id or key (implementations + edges) |
| `create_test_intent` | Create a test intent in the quality graph |
| `get_coverage` | Requirement / risk / automation / execution coverage and gaps |
| `get_requirement` | Get a requirement by id or key |
| `get_execution_history` | Recent run results for an intent or implementation |
| `link_automation` | Link an automation implementation to a test intent |
| `compare_releases` | Compare release snapshots or stored release ids |
| `get_affected_tests` | Walk changed paths through path→component rules to list affected tests and gaps |
| `quality_search` | Search the quality graph with Quality QL (DSL or AST) |
| `search_tests` | Alias for `quality_search` |

### Governed Proposals

| Tool | Description |
| --- | --- |
| `propose_coverage` | Queue a coverage proposal (create intent / link edge) for **human review**. Does **not** write to the graph until accepted. |

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

## Claude Code

Project or user MCP config (`.mcp.json` / Claude Code MCP settings):

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

Claude Desktop uses the same `mcpServers` shape in `claude_desktop_config.json`.

## Codex / generic stdio

```bash
export TOPOLOGY_URL=http://127.0.0.1:4317
export TOPOLOGY_API_TOKEN=topo_your_api_token
npx -y @topology/mcp
```

Or from this repo:

```bash
npm run start --workspace=@topology/mcp
```

Topology UI has **Connect an agent** under [Settings → Integrations](/settings?section=integrations#connections) (`/connect` redirects there) with client tabs, one-click agent token creation, and a connection test against `/api/agent`.
