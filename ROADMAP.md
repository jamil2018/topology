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

## Agent workflow increment

Project-scoped agent credentials, transactional proposal review, opt-in project case review, assigned matrix runs and observations with attachments, revision-pinned regression baselines, exploratory sessions and reviewed follow-up cases, explained PR impact, approved GitHub Actions and GitLab CI dispatch, and current-commit release evidence are implemented. Vendor imports preserve supported structured steps, hierarchy, and source IDs. See [agent workflows](docs/agent-workflows.md) for configuration and project cutover.

## Remaining adoption and workflow work

- Qualify hosted GitHub callbacks and run a live GitLab CI sandbox. GitHub artifact pull delivery has passed a live sandbox. Run the reference journeys in connected Codex and Claude Code sessions and measure the pilot.
- Qualify historical TestRail and Qase migration against live exports and extend it to Zephyr and Xray. Sync Jira requirement revisions, add first-class Gherkin and Cucumber mapping, and reconcile Playwright source discovery.
- Add cross-project dashboards and sharing, scheduled reports, integration administration, and remotely hosted OAuth-backed MCP.
- Qualify self-hosted deployments and live vendor and issue providers. Clean-install fixtures cover CLI, MCP, Playwright, Jest, Cypress, and pytest.

Shipped release history remains in [CHANGELOG.md](CHANGELOG.md).
