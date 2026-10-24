# pytest-topology

Pytest plugin that builds Topology's ExecutionReport JSON and POSTs it to `/api/executions`.

## Install

```bash
pip install pytest-topology
# from this repo:
pip install -e packages/pytest-topology
```

The plugin registers as `pytest11` entry point `topology`; pytest loads it automatically.

## Usage

```bash
export TOPOLOGY_URL=http://127.0.0.1:4317
export TOPOLOGY_API_TOKEN=topo_your_api_token
pytest
```

Dry-run (build, do not upload):

```bash
pytest --topology-dry-run
# or: TOPOLOGY_DRY_RUN=1 pytest
```

Override URL/token for one run: `--topology-url` / `--topology-token`.

## Mapping

Each call-phase log report becomes a protocol result:

- `externalKey` — pytest `nodeid` (`tests/test_auth.py::test_login`)
- `intentKey` — title prefix (`AUTH-001: login`) or `@pytest.mark.topology(intent_key="AUTH-001")`
- statuses — `passed` / `failed` / `skipped` (other outcomes → `error`)

Same JSON shape as `@topology/playwright` / `topology run upload`.
