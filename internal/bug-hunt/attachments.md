# Attachment upload/download bug hunt

Date: 2026-09-17. Live `http://127.0.0.1:4317` as `demo@topology.local`. Scope: `POST/GET /api/results/:id/attachments` and `GET /api/attachments/:id`. Filenames prefixed `BUGHUNT-ATT-`. No code changes, no server restart, no seed/push/migrate.

Probe case `BUGHUNT-ATT-CASE` / run `BUGHUNT-ATT run` / result `ae75e8e2-5a47-42f8-99d2-ba5cdda5a88a` in project Topology (`3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf`). Cross-project pair: case `BUGHUNT-ATT-OTHER` / result `609dec59-9665-46df-802b-fc9722ceaae9` in project Test (`8f861e9a-6cdc-4d2d-a1e7-52fdd7de8de7`). `ATTACHMENTS_DIR` is `./data/attachments` (health + files on disk).

---

## Highest severity

1. **Stored XSS** — client `Content-Type` is stored and `GET /api/attachments/:id` serves the bytes **inline** on the app origin. `text/html`, `application/xhtml+xml`, and `image/svg+xml` (including a `<script>` element) are returned with no `nosniff` and no CSP. The run UI opens that URL in a new tab (`src/components/run-executor.tsx:613-617`).
2. **Oversize upload is an empty 500** — a 20MB file and an exactly 10MB file never reach the handler’s 10MB check. Next truncates the request at 10MB, `request.formData()` throws outside the try/catch, and the client gets an empty 500.

Path traversal, unauthenticated download, and cross-project id swap did not leak file bytes.

---

## Confirmed bugs

### 1. Inline attachment responses execute HTML, XHTML, and SVG on the app origin

`src/lib/attachments.ts:36` stores `file.type` with no allowlist. `src/app/api/attachments/[id]/route.ts:33-38` echoes that type and forces `Content-Disposition: inline`. Nothing sets `X-Content-Type-Options` or `Content-Security-Policy` (repo-wide search has no CSP). Upload requires write (`src/app/api/results/[id]/attachments/route.ts:60-66`); download only requires project access (`src/app/api/attachments/[id]/route.ts:17-28`). Any writer can plant a file that runs as whoever opens the link.

Session cookie is `HttpOnly`, so script cannot read the token, but it runs same-origin and can call authenticated APIs (the cookie is `SameSite=Lax` and is sent on same-origin fetch).

**Evidence (authenticated GET, headers only; session cookie omitted):**

HTML uploaded as `text/html` (`12970a43-f439-4923-9321-8e56ecbebf4e`):

```
HTTP/1.1 200 OK
content-disposition: inline; filename="BUGHUNT-ATT-page.html"
content-length: 108
content-type: text/html
```

Body starts `<!doctype html><html><head><title>BUGHUNT-ATT-HTML</title>`. A top-level navigation treats this as an HTML document and will run scripts. **Would execute.**

SVG with a script element (`a98efafc-c905-4be7-8f93-0beedc54072e`):

```
HTTP/1.1 200 OK
content-disposition: inline; filename="BUGHUNT-ATT-xss.svg"
content-length: 84
content-type: image/svg+xml
```

Body: `<svg xmlns="http://www.w3.org/2000/svg"><script>window.__bughuntAtt=1</script></svg>`. Direct navigation to `image/svg+xml` with `inline` executes SVG script in current browsers. **Would execute.**

XHTML (`aea59880-cda2-47d8-a047-7d6052f79814`):

```
HTTP/1.1 200 OK
content-disposition: inline; filename="BUGHUNT-ATT-page.xhtml"
content-type: application/xhtml+xml
```

**Would execute** if the document contained script. Bytes were not rewritten.

Also accepted, but not a reliable navigation XSS:

- `application/javascript` served `inline` (`content-type: application/javascript`). Browsers do not run a top-level `.js` navigation as a script.
- HTML bytes labeled `image/png`, and JS labeled `image/jpeg`, are stored and echoed as the fake image type (`content-type: image/png` / `image/jpeg`, `content-disposition: inline`). Current Chrome/Firefox will not re-sniff those into HTML. There is still no `nosniff`.

CRLF in the part `Content-Type` and in the filename did **not** inject response headers. The multipart parser dropped the injected line before storage (`content-type` saved as `text/plain` only). `contentType` is still stored unsanitized (`attachments.ts:36`), so this is residual, not a confirmed header injection.

**Suggested fix:** stop reflecting the client type. Download with `Content-Disposition: attachment` and `Content-Type: application/octet-stream`, plus `X-Content-Type-Options: nosniff`. If inline preview is required, allowlist raster types after a magic-byte check, and serve active types (`text/html`, `image/svg+xml`, `application/xhtml+xml`, `application/javascript`) only as attachments. Add `Content-Security-Policy: sandbox` on any response that might still be rendered. Strip CR/LF from any stored type.

### 2. Body cap turns the 10MB limit into an uncaught 500

`src/lib/attachments.ts:5` and `:18-19` reject `file.size > 10 * 1024 * 1024` with 400 `"File exceeds 10 MB limit"`. That path is unreachable for oversize uploads. `request.formData()` at `src/app/api/results/[id]/attachments/route.ts:74` sits **outside** the try at line 80. Next’s default proxy cap logs `Request body exceeded 10MB` and `formData()` throws `TypeError: Failed to parse body as FormData` (`expected boundary after body`). The client gets an empty 500. No `middlewareClientMaxBodySize` is set.

| Upload | HTTP | Notes |
| --- | --- | --- |
| 9,437,184 B (9MB) | 201 | `sizeBytes` matched |
| 10,485,504 B (10MB − 256) | 201 | still under the 10MB **request** cap after multipart overhead |
| 10,485,760 B (exactly 10MB file) | **500** empty | handler would have allowed this (`>` not `>=`) |
| 10,485,761 B and 20,971,520 B (~20MB) | **500** empty | intended 400 never returned; ~80ms, server stayed up |

Truncated bodies were not written (parse threw before `storeAttachmentFile`). Not a disk-escape. Still a broken limit: the advertised 10MB file cannot be uploaded, and oversized uploads are an unhandled exception instead of 400/413.

**Suggested fix:** catch `formData()` failures and return 413/400. Set the proxy body limit above `ATTACHMENT_MAX_BYTES` plus multipart overhead (or lower the file cap so a max file plus headers fits under 10MB). Keep the size check so a raised proxy limit cannot store a larger file.

---

## Coverage

| Attempt | Result |
| --- | --- |
| 0-byte file | 201, `sizeBytes: 0`, GET `content-length: 0`. Allowed. Not a security bug. |
| No `file` field / `file` as a string | 400 `{"error":"file is required"}`. |
| Multiple files in one POST | 201 for the first `file` only; the second name was not stored. Silent drop, not a security bug. |
| Filename `../` and absolute path | Stored as `BUGHUNT-ATT-.._.._etc_passwd` and `BUGHUNT-ATT-_etc_passwd`. On disk those are single path segments inside `data/attachments` (`…-BUGHUNT-ATT-.._.._etc_passwd`). `sanitizeFilename` (`attachments.ts:13-15`) replaces `/` and other non-allowlisted chars. `storageKey` is `${uuid}-${safeName}` (`attachments.ts:25-29`), so `path.join` cannot leave the root. |
| Null in filename | Stored `BUGHUNT-ATT-nu_ll.txt`. Null became `_`. |
| Unicode filename | Stored `BUGHUNT-ATT-_-_-_.txt` (ASCII `\w` only). Data loss, not traversal. |
| 400+ character name | Stored length **180** (`attachments.ts:14`). |
| Double-submit same file | Two 201s, two ids (`6d7a4325-…`, `0cb1fa6f-…`), two storage keys. No dedup. Not a security bug. |
| Content-Type mismatch | Accepted (see bug 1). Fake `image/*` is not executed by current browsers; declared `text/html` / `image/svg+xml` / `application/xhtml+xml` is. |
| Unauthenticated GET list, POST, GET of a real attachment id | **307** to `/login?callbackUrl=…`. Body is the login path, not file bytes (`BUGHUNT-ATT-HTML-MARKER` absent). Invalid session token also 307 and clears the cookie. Route-level 401 is shadowed by middleware (`src/middleware.ts` + `src/auth.config.ts:8-31`) and was not reached. No file leak. |
| IDOR: other project’s attachment id | Attachment `4ebf3332-55a8-4c73-b156-1a5fda3ffe7d` (Test project). GET with default project header, with no project header, and with a bogus `x-topology-project-id`: **404** `{"error":"Not found"}`. GET of the Topology HTML attachment while the header is the Test project: **404**. POST to the Test result without that project header: **404** `Result not found`. GET with the owning project header, as a member: **200** (authorized). Same-project attachment id is readable by any member of that project; that is the access check, not IDOR. Only `demo@topology.local` exists in both projects, so a second non-member account was not available. Spoofing a project id the session does not resolve into did not return the other project’s file (`src/app/api/attachments/[id]/route.ts:27-28`, `src/lib/project.ts:67-80`). |
| Path containment after upload | `ATTACHMENTS_DIR` realpath `/Users/jamil/Personal Projects/topology/data/attachments`. Every file under that tree realpath-stays inside it. No file appeared under `data/` outside `attachments/`. `readAttachmentFile` (`attachments.ts:41-43`) does not re-check the resolved path, but the only key this API writes is a single sanitized segment, so this is not exploitable from upload. |

---

## Leftover probe data

Cases, runs, and `BUGHUNT-ATT-*` files under `data/attachments` were left in place (including several multi-megabyte bins from the size probes). Not deleted.

```json
[
  {
    "id": "attachment-inline-content-type-xss",
    "severity": "high",
    "title": "Attachment GET serves client Content-Type inline, so HTML/SVG/XHTML execute on the app origin",
    "area": "attachments",
    "file": "src/app/api/attachments/[id]/route.ts:33",
    "repro_summary": "POST /api/results/:id/attachments with a file part Content-Type text/html, application/xhtml+xml, or image/svg+xml (SVG may include a script element). GET /api/attachments/:id returns 200 with that Content-Type, Content-Disposition: inline, and no nosniff/CSP. The run UI links that URL in a new tab, so a member who opens it runs script same-origin."
  },
  {
    "id": "attachment-oversize-unhandled-500",
    "severity": "medium",
    "title": "Uploads at or over 10MB return an empty 500; the handler's 10MB check never runs",
    "area": "attachments",
    "file": "src/app/api/results/[id]/attachments/route.ts:74",
    "repro_summary": "POST a multipart file of exactly 10MB or ~20MB to /api/results/:id/attachments. Next truncates the body at 10MB, request.formData() throws outside try/catch, and the client gets an empty 500 instead of 400 File exceeds 10 MB limit. A 10MB-minus-256-byte file still 201s."
  }
]
```
