// Reviewed assertion scopes. These describe what assertions prove, not a claim
// that every step in a legacy release case has been automated.
export const assertionScopes: Record<string, { checks: string[]; proves: string }> = {
  "SEC-HEADERS-001": { checks: ["src/lib/security-headers.test.ts", "e2e/security/session.spec.ts"], proves: "Real HTTP HTML/API baseline CSP, frame denial, nosniff and no-referrer; conditional HSTS unit policy. Actual HTTPS terminator/HSTS behavior remains unqualified." },
  "SEC-SECRET-002": { checks: ["e2e/security/api.spec.ts"], proves: "Configured webhook secret absent from admin create/list/update responses. Other secret APIs retain their separate manual contract." },
  "INT-HOOK-002": { checks: ["tests/integration/webhooks.integration.test.ts"], proves: "500/500/200 repeats one signed body and delivery ID, records success; permanent 500 stops after three, 404 fails after one. In-process delivery is not durable across process death." },
  "FN-QG-005": { checks: ["e2e/functional/quality-graph.spec.ts"], proves: "HTTP release snapshots preserve old coverage, compare exact 0→100 percentage delta, analyze unexecuted intent and reload persisted UI." },
  "FN-QG-006": { checks: ["e2e/functional/quality-graph.spec.ts"], proves: "Intent and requirement created through authenticated HTTP; covers edge persists and coverage totals equal one. Journey UI steps retain manual qualification." },
  "UX-NET-003": { checks: ["e2e/functional/live.spec.ts"], proves: "Controlled closed SSE response/connection errors followed by real stream reconnect catch up a missed result from another session." },
  "FN-AUTH-001": { checks: ["e2e/onboarding.spec.ts"], proves: "Empty DB concurrent first-admin creation accepts one request, refuses a second, and supports real login/reload." },
  "FN-REP-002": { checks: ["src/lib/tcm/export.test.ts", "e2e/functional/reports.spec.ts"], proves: "CSV content, real OOXML archive and typed/formula-safe cells, HTTP workbook row count, PDF signature/content and pagination beyond 48 lines." },
  "FN-REP-003": { checks: ["e2e/functional/reports.spec.ts"], proves: "Cookie-free guest renders a shared completed report and CSV equals authenticated export." },
  "FN-REP-004": { checks: ["tests/integration/report-share.integration.test.ts", "e2e/functional/reports.spec.ts"], proves: "Legacy/current generations, atomic audited revocation, all export formats denied, fresh URL works, cross-project and unauthorized requests denied." },
  "SEC-SHARE-001": { checks: ["src/lib/tcm/share-token.test.ts", "tests/integration/report-share.integration.test.ts"], proves: "Signature/expiry/UUID/generation validation; concurrent persisted increments and audit rollback; legacy invalidation." },
  "UX-ERR-001": { checks: ["src/components/route-error.test.tsx", "e2e/ux/errors.spec.ts"], proves: "Seven segment boundaries call retry; actual production server render failure recovers after the owned DB table is restored." },
  "UX-THEME-001": { checks: ["src/components/theme-provider.test.tsx", "e2e/ux/theme.spec.ts"], proves: "Persisted theme reload; delayed settings read cannot overwrite explicit user choice." },
  "UX-NET-001": { checks: ["e2e/ux/network.spec.ts"], proves: "Controlled pending save disables duplicate submission and persists once released." },
  "UX-NET-002": { checks: ["e2e/ux/network.spec.ts", "src/components/case-edit-panel.test.tsx"], proves: "Connection failure, HTTP 500 and simulated expired-session HTTP 401 preserve draft and stored original; retry persists after reload. This does not expire an actual auth cookie." },
  "OPS-PERF-001": { checks: ["e2e/performance.spec.ts", "scripts/perf-bench.ts"], proves: "50,000 cases; 10 warmups + 100 HTTP samples and separately measured DB query p95 below 500 ms." },
  "OPS-PERF-002": { checks: ["e2e/performance.spec.ts"], proves: "5,000 results paint under 2 s; bounded DOM, action p95 under 500 ms and long tasks below 200 ms." },
  "OPS-PERF-003": { checks: ["e2e/performance.spec.ts", "tests/integration/ingest-batch.integration.test.ts"], proves: "10,000-result real HTTP ingestion below 30 s and exact persisted count; 501-row boundary, collisions, concurrent reuse, rollback and independently calculated historical statistics." },
  "OPS-LH-001": { checks: ["e2e/lighthouse.spec.ts"], proves: "Authenticated production hub/cases/run Lighthouse performance and best-practice >=90, accessibility 100; raw reports and hardware attached." },
  "OPS-DOCKER-001": { checks: ["scripts/validation/container.ts"], proves: "Real built production image health, UID 1000, fresh first-admin install, unstamped reconcile and local attachment persistence after restart." },
  "OPS-MIG-002": { checks: ["scripts/validation/operations.ts"], proves: "Previous journal migration with preserved run upgrades to current share generation zero." },
  "OPS-MIG-003": { checks: ["scripts/validation/operations.ts"], proves: "Applying the current journal a second time is idempotent." },
  "OPS-MIG-004": { checks: ["scripts/validation/container.ts"], proves: "Production runner reconciles a populated unstamped DB using bundled SQL without losing admin or attachment." },
  "OPS-BAK-001": { checks: ["scripts/validation/operations.ts"], proves: "Custom pg_dump restored into another owned DB preserves run count; PostgreSQL and MinIO restart preserve DB/object bytes." },
  "INT-S3-001": { checks: ["tests/integration/s3-attachments.integration.test.ts"], proves: "Required owned MinIO upload/download contract; unavailable storage fails selected-suite preflight." },
  "VAL-PROD-003": { checks: ["e2e/functional/plans.spec.ts"], proves: "One combined isolated HTTP/UI journey authors a case, launches exactly two matrix runs, fails/completes one, inspects triage, retests/passes/completes, reloads, exports exactly one passed row and preserves original failure." },
  "VAL-PROD-001": { checks: ["e2e/refinement.spec.ts", "tests/integration/productivity.integration.test.ts"], proves: "Template review/launch, failed result retest lineage and original-result preservation; project-scoped persistence/rollback." },
  "VAL-PROD-002": { checks: ["e2e/functional/isolated-authoring.spec.ts"], proves: "Unique project/case survives reload; foreign viewer gets HTTP 403." },
  "VAL-AUTO-001": { checks: ["tests/integration/ingest-batch.integration.test.ts"], proves: "Batched ingestion graph identity, authored intent preservation, concurrent reuse, project separation, full transaction rollback and historical stats." },
  "VAL-SEC-001": { checks: ["e2e/security/api.spec.ts"], proves: "Cookie-free real HTTP bearer scopes, token revocation and public/private isolation." },
  "VAL-VIS-001": { checks: ["e2e/visual.spec.ts"], proves: "18 inspected Linux light/dark references across primary, long-title, dialog, empty and actual error states; exact comparison in release evaluation." },
};

export function qualification(id: string, behavior: string): string {
  if (/A11Y-SR-001/.test(id)) return "UNQUALIFIED: macOS with VoiceOver, a human operator and the isolated seeded app; execute every documented navigation/announcement step and record spoken output.";
  if (/A11Y-SR-002/.test(id)) return "UNQUALIFIED: Windows with NVDA and supported browser, a human operator and the isolated seeded app; record focus and announcements for every documented step.";
  if (/SEC-ZAP/.test(id)) return "UNQUALIFIED: OWASP ZAP installed, an explicitly scoped disposable app target and authorized scan operator; run documented baseline and triage alerts. No external target scanning is authorized.";
  if (id === "FN-AUTH-007" || /real (?:OAuth|SSO|OIDC|provider)|live provider|configured (?:GitHub|Google|OIDC)/i.test(behavior)) return "UNQUALIFIED live path: provider sandbox account/application, configured callback URL, scoped credentials and consent. Deterministic mocks cannot certify OAuth or remote writes. Execute this case's exact documented steps.";
  if (/zoom|text spacing/i.test(behavior)) return "UNQUALIFIED native behavior: human operator, real desktop browser with 200%/400% native zoom and OS text settings; execute the documented reflow/focus steps. Viewport emulation is separate evidence.";
  return "Manual qualification remains NOT RUN beyond the stated assertion scope. Start `npm run test:e2e:debug` (owned disposable services, Node 22, Docker, Python/pytest and Chromium); use its printed origin and synthetic seed accounts. Execute this case's Preconditions, Steps and Expected verbatim from expectedBehavior, capture persistence after reload, negative permissions and recovery evidence, and stop the harness afterward. Never clear developer DB rows to satisfy a precondition.";
}
