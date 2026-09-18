# Triage enqueue

Date: 2026-09-17. Not committed. Dev server on port 4317 left running (not killed, not reseeded). `.env.local` was not sourced.

## Fixed

`openTriageForResult` and `openTriageForFailures` now treat `blocked` the same as `failed`. Passed, skipped, and untested still return without a write.

`upsertTriageItem` still updates an open or snoozed row with the same fingerprint instead of inserting. If that miss still finds an open or snoozed row for the same result, it updates that row (including the fingerprint) instead of inserting a second one.

Agent `record_result` calls `openTriageForResult` after a failed or blocked update. Passed and skipped do not.

Write path matches the existing failed path: the row is queued even if a linked issue already exists. `getTriageQueue` still hides linked results, so a blocked result without a linked issue shows in `/triage` the same way an unlinked failure does.

`src/app/api/runs/[id]/route.ts` now calls `openTriageForResult` when the patched status is `failed` or `blocked`. Passed, skipped, and untested still do not. The helper still dedupes, so this does not insert a second row. No unit test covers that route, so none was added.

## Not in these files

No unit test covers `openTriageForResult`. `src/lib/ci-ingest.test.ts` still only covers key, shard, and unique-violation helpers, so it was not edited.

## Tests

`npx vitest run --config vitest.packages.config.ts src/lib/ci-ingest.test.ts` — 4 passed. Those tests do not call `openTriageForResult`. Vitest's config injected `.env.local`; this session did not source it.
