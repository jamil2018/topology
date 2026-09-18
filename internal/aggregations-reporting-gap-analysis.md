# Aggregations / reporting gap analysis

Source of truth: **`origin/main`** (`afdf243`) via `git show` / `git grep`. Current checkout `cursor/case-picker-toolbar-d945` is **behind** main (missing `/reports` and hub bento); domain + triage/retest/issue wiring for these five areas is otherwise the same.

No `TODO`/`FIXME`/`stub` markers for these features. Gaps are missing surfaces or incomplete wiring, not commented stubs.

---

## Summary table

| Feature | Domain | Schema / seed | API | UI | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1. Milestone readiness | Done | Done (thresholds cols) | **No CRUD API** | Hub badge only | **Partial** |
| 2. Failure triage queue | Done | Done | GET/PATCH | `/triage` | **Partial** (not “unlinked-only”; no file-issue on triage) |
| 3. Flake signal | Done | N/A (computed) | Implicit via queries | Hub + triage (+ reports on main) | **Mostly done**; automation browser orphaned |
| 4. Retest on issue close | Flag + helpers | `needs_retest` | GET queue + `ack_retest` | Run executor chip only | **Partial** (hub data unused; no auto-run) |
| 5. Webhooks | — | — | — | — | **Absent** |

---

## 1. Milestone readiness (Go / At-risk / No-Go)

### Exists

| Path | Status |
| --- | --- |
| `packages/domain/src/readiness.ts` | `computeMilestoneReadiness` → `ready` \| `at_risk` \| `blocked`; score, passRate, openP0Failures, reasons. Thresholds: `minPassRate`, `maxOpenP0Failures`, optional `requireReadyCases`. |
| `packages/domain/src/index.ts` | Re-exports readiness API. |
| `packages/domain/src/domain.test.ts` | Unit tests for ready / blocked-on-P0. |
| `src/db/schema.ts` (`milestones`) | `passRateThreshold` (default 95), `maxOpenP0Failures` (default 0), `status`, `folderId`, `targetDate`. |
| `src/db/seed.ts` | Seeds one active milestone with thresholds. |
| `src/lib/queries.ts` → `getActiveMilestoneReadiness()` | Loads latest active milestone, maps suite cases + latest results, calls domain. Hardcodes `requireReadyCases: true`. |
| `src/app/page.tsx` + `src/components/hub-pulse.tsx` | Hub badge + gate section (name, reason, pass %, score). |
| Badge labels | `readinessBadgeLabel` → **"Ready" / "At risk" / "Blocked"** (not Go / No-Go). |

### Missing / gaps

- **No** `/api/milestones` (or settings PATCH) — thresholds only via DB/seed.
- **No** milestones settings UI / CRUD page.
- Product wording **Go / At-risk / No-Go** not implemented (`blocked` ≈ No-Go; `ready` ≈ Go).
- `requireReadyCases` not a DB column — fixed in query.
- No dedicated readiness JSON endpoint for CI/agents (only page-server query).

---

## 2. Failure triage queue (failed, no linked issue + file/link UX)

### Exists

| Path | Status |
| --- | --- |
| `packages/domain/src/triage.ts` | `failureFingerprint`, `buildTriageQueue` (rank/urgency; demotes `isFlaky`). |
| `src/db/schema.ts` (`triage_items`) | fingerprint, status open/snoozed/resolved, priority, case/run/result FKs, occurrenceCount. |
| `src/lib/ci-ingest.ts` → `openTriageForFailures` | Upserts triage rows for **failed** results on CI complete / JUnit ingest. |
| `src/app/api/ci/runs/[id]/complete/route.ts`, `src/app/api/ci/junit/route.ts` | Call `openTriageForFailures` after ingest. |
| `src/app/api/triage/route.ts` | Auth GET queue; PATCH status. |
| `src/lib/queries.ts` → `getTriageQueue` | Joins open items + flake hints → ranked queue. |
| `src/app/triage/page.tsx`, `src/components/triage-workspace.tsx` | Queue UI: snooze / resolve; link to run; flake chips. |
| `src/lib/issues.ts` → `whatsPending()` | **`failuresWithoutIssue`** filter (failed/blocked minus linked result IDs) for agent. |
| `src/app/api/agent/route.ts` | `resource=whats_pending`. |
| `src/components/run-executor.tsx` + `src/app/api/issues/route.ts` | **Create issue / Link** on failed/blocked **run results** (not on triage page). |

### Missing / gaps

- Triage table enqueue is **all CI failures**, not “failures without linked issue.” Unlinked filter exists only in agent `whatsPending`.
- **No Create/Link issue** actions on `/triage` — must open the run.
- Manual run failures **do not** call `openTriageForFailures` (copy says “CI and manual”; ingest is CI-only).
- Resolving triage does not require / sync a linked issue.
- `src/app/api/ci/runs/[id]/shards/route.ts` imports `openTriageForFailures` but does not call it (dead import on main).

---

## 3. Lightweight flake signal (automation browser + hub)

### Exists

| Path | Status |
| --- | --- |
| `packages/domain/src/flake.ts` | `detectFlakeSignal` (default minSamples 4, threshold 40); `flakeBadgeLabel`. |
| `packages/domain/src/domain.test.ts` | Alternating vs consistent-fail tests. |
| `packages/domain/src/pulse.ts` | Pulse includes `flakeSuspects`. |
| `src/lib/queries.ts` | `countFlakeSuspects`, `getFlakeHints`, triage flake merge. |
| Hub (`hub-pulse.tsx`) | Flake count in pulse / chips (richer bento on main). |
| Triage UI | Per-item flake demotion + “Flake hints” section. |
| `src/lib/report-stats.ts` + `/reports` (**main only**) | Report KPIs / failure rows include flake. |

### Missing / gaps

- **`AutomationWorkspace` is orphaned**: `src/components/automation-workspace.tsx` exists; `src/app/automation/page.tsx` **redirects** to `/settings?section=ci`. Settings CI is token/docs only (`ci-setup-panel.tsx`); run history → `/runs` + hub.
- No dedicated `/api/flake` or user-configurable flake threshold (domain defaults only).
- Flake not surfaced as a first-class automation-browser column (component unused).

---

## 4. Retest affordance when linked issue closes

### Exists

| Path | Status |
| --- | --- |
| `src/db/schema.ts` (`linked_issues.needs_retest`) | Integer flag default 0. |
| `src/lib/issues.ts` | On refresh: if status transitions → `done`, set `needsRetest: 1`; `listRetestQueue`; `clearRetestFlag`. |
| `src/app/api/issues/route.ts` | GET returns `retestQueue`; POST `ack_retest`. |
| `src/components/run-executor.tsx` | “Retest ready” chip → `ack_retest` (ack only). |
| `src/lib/queries.ts` → `getHubPulse` | Returns `retestQueue` (slice 8). |
| Agent / MCP | `whats_pending.retestQueue`; MCP copy mentions retest queue. |

### Missing / gaps

- **Hub does not render `retestQueue`** despite query returning it — README “hub Retest queue” is overstated.
- No auto-create / deep-link “start retest run”; ack clears flag only.
- Close detection only on **manual Sync** (`refresh` action) — no inbound provider webhook.
- No standalone retest page or hub widget.

---

## 5. Webhooks on run complete / issue created

### Exists

Nothing. No webhook table, env (`TOPOLOGY_WEBHOOK_*` absent from `.env.example`), outbound HTTP helper, or dispatch from:

- `src/app/api/ci/runs/[id]/complete/route.ts`
- `src/app/api/ci/junit/route.ts`
- `src/lib/issues.ts` (`createIssueFromResult` / `linkExistingIssue`)

### Missing

Full feature: URL registry, signing secrets, event types (`run.completed`, `issue.created`), delivery retries, settings UI, and call sites on complete + issue create.

---

## Related aggregations (context)

| Path | Notes |
| --- | --- |
| `packages/domain/src/pulse.ts` | Quality pulse (healthy/watch/critical). |
| `packages/domain/src/junit.ts` | JUnit parse / shard merge / summarize. |
| `src/lib/report-stats.ts` + `src/app/reports/**` | **On main only** — run report charts/KPIs/flake. Current feature branch lacks this tree. |
| `src/app/api/ci/*` | CI create / shards / complete / junit. |

---

## Key file index

```
packages/domain/src/readiness.ts
packages/domain/src/triage.ts
packages/domain/src/flake.ts
packages/domain/src/pulse.ts
packages/domain/src/domain.test.ts
src/db/schema.ts                 # milestones, triage_items, linked_issues.needs_retest
src/db/seed.ts
src/lib/queries.ts               # hub pulse, milestone readiness, triage, flake
src/lib/ci-ingest.ts             # openTriageForFailures
src/lib/issues.ts                # create/link/refresh, retest queue, whatsPending
src/app/api/triage/route.ts
src/app/api/issues/route.ts
src/app/api/ci/runs/[id]/complete/route.ts
src/app/api/ci/junit/route.ts
src/app/api/agent/route.ts
src/app/page.tsx
src/app/triage/page.tsx
src/app/automation/page.tsx      # redirect only
src/components/hub-pulse.tsx
src/components/triage-workspace.tsx
src/components/run-executor.tsx
src/components/automation-workspace.tsx  # orphaned
src/app/reports/**               # main only
src/lib/report-stats.ts          # main only
```

---

## Highest-value gaps (if implementing next)

1. **Webhooks** — zero coverage today.
2. **Milestone CRUD / settings** — logic + hub display exist; configuration does not.
3. **Triage ↔ issues** — file/link from triage; optionally enqueue only unlinked failures (align UI with `whatsPending`).
4. **Hub retest queue UI** — data already in `getHubPulse`; wire widget + optional “start run” hook.
5. **Wire or delete `AutomationWorkspace`** — page currently redirects away.
