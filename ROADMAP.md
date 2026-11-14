# Roadmap

Topology is pre-1.0. Implementation and release qualification are separate: a feature listed below does not imply production-host or external-provider certification.

## Implemented foundation

- Scoped tokens, workspace/custom roles, login protections, OIDC configuration, audit history, and guarded seed modes.
- Standalone deployment configuration, journaled migrations, local/S3 attachment adapters, and operations documentation.
- Structured and shared steps, case versions and data iterations, matrix plans, custom fields, and vendor import preview/dry-run workflows.
- Compact navigation with an opt-in quality graph, command palette, keyboard shortcuts, and live run/triage updates.
- Server pagination for cases and runs, result indexes, and disposable scale fixtures.

## Refinement cycle

The current cycle adds capability-aware controls, mutation recovery, accessible overlays, responsive cases/execution, private/team views, run templates, reviewed retests with immutable source lineage, and assignment notifications. See [the implementation and verification record](docs/refinement.md) for evidence and open gates. These changes are not yet a published release.

## Remaining adoption work

Qualify production deployment, backups/restores, S3-compatible providers, and actual issue-provider installations. Continue large-data and cross-browser measurement using isolated fixtures. Publish and validate versioned CLI/MCP/reporter distributions, evaluate additional runner reporters, and decide the supported plugin SDK surface before a public resettable demo.

Shipped release history remains in [CHANGELOG.md](CHANGELOG.md).
