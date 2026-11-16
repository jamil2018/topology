# Findings and repairs

Reproductions use disposable owned services. Earlier failed run artifacts remain under `test-results/validation-*/`; final acceptance is recorded separately. Tests are not treated as release-case coverage merely because a filename exists.

| ID | Severity | Reproduction and expected → actual | Repair and regression |
| --- | --- | --- | --- |
| VAL-001 | High | Create a report URL, then try to invalidate it. Expected authorized revocation; no revoke control/API existed and the URL stayed valid until expiry. | Persisted generation, atomic increment plus audit, authorized UI/API, legacy generation zero invalidation, public page and every export checked on each request. Token/component/real PostgreSQL/HTTP browser regressions. |
| VAL-002 | Medium | Run test:e2e. Expected full deterministic Chromium; only smoke/release gate ran, using development mode and CI retries. | Comprehensive production Chromium by default; explicit smoke/debug commands; retries zero; skips/flaky results fail the harness. |
| VAL-003 | Medium | Select integration without required storage. Expected failed preflight; missing MinIO silently skipped S3. | Owned PostgreSQL/MinIO and mandatory preflight; isolated integration leases and skipped-test result guard. |
| VAL-004 | Medium | Export assertions accepted any payload over ten bytes. | CSV contents, actual OOXML package/typed values/row totals, PDF content and multiple pages; public CSV equality and revoked exports. |
| VAL-005 | High | Make cases table unavailable, visit /cases, restore it, press Try again. Expected recovery; reset reused failed server-component payload. | All seven Next boundaries use installed-version retry API to refetch. Seven component regressions and real production server recovery test. Failed reproduction validation-ed7476ceb0ef19f7; fixed validation-138e5d9540d6cad9. |
| VAL-006 | High | Ingest 10,000 normalized results. Expected under 30 s; per-row graph/stat queries exceeded request timeout. | 500-row case/intent/implementation/result batches and bulk rolling stats. Exact 10k HTTP persistence, concurrency/collision/501-boundary and rollback checks; observed about 4.9 s before final gate. |
| VAL-007 | High | Build rolling implementation statistics from real historical results. Expected stored windows; raw Date SQL binding threw and caller swallowed the failure. | Bind ISO timestamp; independent 10-day fixture expects 100%/50% window pass rates and 10/40 duration percentiles. |
| VAL-008 | Medium | Select dark theme while an older light settings read is pending. Expected latest user choice; delayed read overwrote it. | Track explicit choice during hydration; controlled pending-read component regression and browser persistence checks. |
| VAL-009 | High | Start production image against a populated unstamped DB. Expected reconciliation; runner omitted reconcile-unstamped.sql. | Bundle SQL in runner; real Node 22 image install/reconcile/persistence test. |
| VAL-010 | Medium | Download .xlsx. Expected Office Open XML ZIP; response was SpreadsheetML 2003 XML with wrong MIME/extension. | Real OOXML workbook with typed inline strings/numbers, safe sheet names, formula-safe cells and standard MIME; archive/content unit and HTTP checks. |
| VAL-011 | Medium | Export more than 48 lines to PDF. Expected all report data; content silently truncated after the first page. | Paginated page tree and streams; independent 100-row/three-page regression verifies final row. |
| VAL-012 | High | Audit original runtime dependencies. Known high/critical production advisories were present. | Compatible lockfile updates and Next/eslint-config-next 16.4.6; production-only audit has zero advisories. Seven development dependency advisories remain a separate qualification. |

| VAL-013 | High | WebKit or a slow script download allows typing before React hydration; expected credentials survive, actual email state resets and valid login fails. | Disable fields until hydration; delayed-JS browser regression requires disabled fields, then successful real login. |
| VAL-014 | High | GET HTML/API responses lacked promised security headers. | CSP default-src self/frame-ancestors none, frame denial, nosniff and no-referrer; HTTPS-origin runtime HSTS, HTTP assertions and unit policy checks. Actual TLS remains unqualified. |
| VAL-015 | Medium | Installed Next docs deprecate middleware.ts. | Move auth to proxy.ts while retaining matcher and real HTTP authentication tests; runtime HSTS preserves standalone configurability. |
| VAL-016 | Medium | Receiver returns 500 twice then 200; expected documented bounded retry, actual only one attempt. | Three attempts with 100/300 ms backoff, repeated destination safety checks, stable signed body/delivery ID, final persisted status; 404 is failed once, permanent 500 stops after three. |
| VAL-017 | High | Admin GET /api/webhooks returned configured secrets despite SEC-SECRET-002. | Webhook secrets are write-only for every role; create/list/update responses omit them; real authenticated HTTP regression. |

| VAL-018 | High | Unauthenticated sweep received an unexpected 2xx. Expected hard failure; actual only wrote a findings entry and continued green, including previously known holes. | Remove findings-file mutation and exemptions; every unexpected unauthenticated success fails. |

| VAL-019 | High | Toggle an executor from light to dark in WebKit; retest-history summary inherited light ink on dark panel (1.06:1), failing axe contrast. | Bind expandable summary text explicitly to the ink token; existing real Firefox/WebKit theme/axe regression covers it without disabling contrast. |

| VAL-020 | High | Use CLI bearer authentication without cookies for coverage, affected, query or git ingest. Handlers supported tokens but the auth interceptor redirected to login before they ran. | Explicit exact-path bearer pass-through while preserving handler scope checks; unit neighboring-path denial and cookie-free HTTP success/401/403 regressions with redirects disabled. |

Harness corrections: exact/scoped selectors, missing-session assertions, cookie-free API contexts (inherited admin cookies previously masked token revocation), strict fixture prerequisites, per-test production server/DB leases, standalone startup, and stable Linux rendering. First full matrix had 216 passes and nine host-browser failures (Firefox macOS profile launch; WebKit access-control teardown); failed evidence is retained, not counted clean.

Subjective observations: long titles wrap and remain editable but increase row height; a denser optional display may help large catalogs. Human usability, screen readers, native zoom and physical-device ergonomics remain unqualified. These are not recorded as confirmed defects.

Historical WH-001 is a contract clarification: the current Webhooks UI explicitly offers optional HMAC. Empty-secret endpoints retain that documented compatibility; configured secrets sign every retry. WH-002 was still an actual missing documented capability and is repaired as VAL-016. Historical ops findings are retained with a current reconciliation note.

WebKit navigation diagnostics: upstream https://github.com/microsoft/playwright/issues/43120 documents same-origin cancellation misclassified as a page error during document replacement. The harness retains these entries and distinguishes them only for WebKit, the same origin, the exact error suffix and a pending main-frame navigation. Other page errors fail. This is an explicit engine qualification, not a suppressed application exception.
