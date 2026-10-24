# Roadmap

Topology is pre-1.0. This is the public adoption sequence, not a release calendar.

## Secure by default

Remove development-only auth shortcuts from production, add scoped API tokens with revoke, fail closed on unsigned GitHub webhooks, gate demo seed data, and add first-run admin setup, login rate limiting, generic OIDC, and an audit log.

## Production self-hosting

Ship a standalone container image, a production Compose file, journaled migrations on boot, S3-compatible attachment storage, and operations docs for TLS, backup, restore, and upgrades.

## Test management parity

Add structured steps with per-step results, shared steps, case versions, test plans with a configuration matrix, custom fields, and importers for TestRail, Qase, Zephyr Scale, and Xray (mapping preview and dry run). Export run and milestone reports.

## Linear-grade UX

Optimistic updates on hot paths, a complete keyboard shortcut system, a command palette that covers every destination, live run/triage updates, a quieter default nav with the quality graph opt-in, and guided empty states.

## Scale

Server-side pagination and filtering, indexes on run results, set-based queries in place of N+1 paths, and a large fixture benchmark.

## Ecosystem

Publish the CLI, MCP, and Playwright packages, add reporters for other runners, finish or drop the unused plugin SDK, sync issues outbound, and host a resettable public demo.

Shipped work is recorded in [CHANGELOG.md](CHANGELOG.md).
