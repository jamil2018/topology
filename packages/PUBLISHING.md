# Publishing Topology packages

The hub app (`topology` at the repo root) stays **private**. Workspace packages below are public-ready (`publishConfig.access: public`).

Packages currently export TypeScript source (`"type": "module"`). The CLI and MCP bins run via `tsx` (a production dependency). Consumers in this monorepo resolve workspace source the same way.

## Order

Publish **leaves first** so npm can resolve workspace dependencies:

1. `@topology/domain` — protocol, JUnit, quality-graph helpers (no Topology server)
2. `@topology/cli` — depends on `@topology/domain`
3. `@topology/playwright` — depends on `@topology/domain`
4. `@topology/jest` — depends on `@topology/domain`
5. `@topology/cypress` — depends on `@topology/domain`
6. `@topology/mcp` — HTTP client; no workspace package deps

`@topology/issue-providers` and `@topology/plugin-sdk` stay private until a separate release (they are loaded from this repo / the hub process).

Python: `pytest-topology` is not an npm package. From `packages/pytest-topology`:

```bash
python -m build
python -m twine upload dist/*
```

## npm env

| Variable | Required | Purpose |
| --- | --- | --- |
| `NPM_TOKEN` | yes | Automation token with publish rights to the `@topology` scope |
| `NODE_AUTH_TOKEN` | yes for CI | Same value as `NPM_TOKEN`; npm’s GitHub Actions convention |

Local one-off (after `npm login`):

```bash
cd packages/domain && npm publish --access public
cd ../cli && npm publish --access public
# …then playwright, jest, cypress, mcp
```

CI example:

```bash
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > ~/.npmrc
npm publish --workspace @topology/domain --access public
```

Do not pass `--provenance` until the GitHub `id-token: write` permission is set on the release workflow.

## Versioning

Bump the package `version` (and any dependents’ `dependencies`) before publish. Keep versions aligned with the root [CHANGELOG.md](../CHANGELOG.md) until packages diverge.
