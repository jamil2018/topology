# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- TestRail, Qase, Zephyr Scale, and Xray case importers with mapping preview and dry run ([docs/import.md](docs/import.md))


- Production Dockerfile (Next.js standalone), `docker-compose.prod.yml`, and GHCR publish on `v*` tags (`ghcr.io/<github.repository>`)
- Journaled Drizzle baseline (`0000_baseline`) applied by `npm run db:migrate` and on container start
- S3-compatible attachment storage (`ATTACHMENTS_DRIVER=local|s3`)
- Operations guide: [docs/deploy.md](docs/deploy.md)
- Public-ready npm metadata for `@topology/domain`, `@topology/cli`, `@topology/mcp`, `@topology/playwright`, `@topology/jest`, and `@topology/cypress` (see `packages/PUBLISHING.md`)
- Pytest plugin (`pytest-topology`), Jest reporter (`@topology/jest`), and Cypress plugin (`@topology/cypress`) on the JSON execution protocol
- GitLab issues provider in `@topology/issue-providers`, plus a GitLab CI example that uses the CLI
- Outbound issue close/transition on Jira, Linear, GitHub, GitLab, and mock when a retest passes or an issue is marked closed
- `registerIssueProvider` wired through `@topology/plugin-sdk` so custom IDs resolve in `resolveIssueProvider`
- Demo runbook: [docs/demo.md](docs/demo.md) (nightly-reset, no hosted URL)

## [0.1.0] - 2026-10-24

Initial public snapshot of Topology as a self-hosted test case manager.

### Added

- Operating hub with quality pulse, milestone readiness, flake and retest queues
- Cases and folders with CSV import/export, manual runs, comments, and attachments
- CI JUnit ingest and shard merge via CLI and `/api/ci/*`
- Issue create/link against Jira, Linear, GitHub, or a mock provider
- MCP agent plugin and Settings connections for local agents
- Outbound webhooks for run, issue, coverage, and proposal events
- Apache-2.0 license, security policy, code of conduct, contributing guide, and public roadmap

[Unreleased]: https://github.com/jamil2018/topology/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jamil2018/topology/releases/tag/v0.1.0
