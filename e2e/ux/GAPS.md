# UX qualification boundaries

The release suite compares 18 inspected light/dark Linux snapshots covering home, cases (including a long title and editor), runs, reports, empty results and an actual server error. Fixture UUIDs and dates are deterministic; no broad masking hides data. See `e2e/visual.spec.ts` and `tasks/validation/README.md`.

`e2e/ux/errors.spec.ts` temporarily renames the cases table only after checking the disposable ownership marker, restores it in finally and exercises the actual production segment boundary and server retry. No production failure endpoint exists.

`e2e/ux/network.spec.ts` controls pending/rejected/aborted saves and HTTP 401 responses, verifies draft retention and unchanged persisted data, then retries and reloads. A simulated HTTP 401 does not qualify actual session expiry during editing. Theme hydration races have a controlled asynchronous component regression. `e2e/functional/live.spec.ts` exercises two-session updates and reconnect catch-up after connection loss.

Automated axe checks enforce serious/critical violations; lower-impact annotations remain available for human review. Native zoom, real screen readers, touch-device ergonomics and human discoverability are explicit unqualified checks. Keyboard cursor movement on J/K is intentional and distinct from DOM focus.
