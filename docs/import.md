# Importing cases

Topology can import test cases from TestRail, Qase, Zephyr Scale, and Xray into the current project. Native CSV import/export is unchanged (`/api/import/csv`).

Open **Test Cases → CSV → Import TestRail / Qase / Zephyr / Xray**, or go to `/cases/import`. The command palette action is **Import cases**. Both preview and import require the `cases.create` permission.

Vendor credentials are used for that request only. They are not stored.

## Flow

1. Choose a provider and upload an export (or, for TestRail / Qase / Zephyr Scale, call their API).
2. **Preview mapping** returns source column names, a suggested mapping onto Topology fields, counts, and up to five sample rows. Nothing is written.
3. Adjust the mapping if a column was guessed wrong.
4. **Dry run** applies the mapping, reports how many cases would be created, and lists keys that already exist. Still no writes.
5. **Import cases** inserts new cases. Existing keys in the project are skipped. Missing folders are created by name (a path such as `Auth / Recovery` becomes a single folder name, same as CSV import).

Duplicate keys inside the file are also skipped after the first row.

## Topology fields

| Field | Notes |
| --- | --- |
| `key` | Unique per project. Generated as `TR-n` / `QS-n` / `ZE-n` / `XR-n` when blank. TestRail numeric ids become `C1`. |
| `title` | Required. |
| `description` | Free text. |
| `preconditions` | Free text. |
| `steps` | Plain text. Structured `case_steps` are not required for import. |
| `expectedResult` | Plain text. Per-step expected results are numbered and joined. |
| `priority` | `P0`–`P3`. Vendor labels such as Critical / High / Medium / Low are mapped. |
| `status` | `draft`, `ready`, `blocked`, `deprecated`. |
| `folder` | Matched by name (case-insensitive); created if missing. |
| `tags` | Split on `;` or `,`. |

## Formats

### TestRail

| Source | Shape |
| --- | --- |
| XML | Suite export (`<suite> / <sections> / <section> / <cases> / <case>`). Reads `custom/preconds`, `custom/steps_separated`, or text `custom/steps`. Nested sections become `Parent / Child`. |
| CSV | Typical columns: `ID`, `Title`, `Section Hierarchy`, `Preconditions`, `Steps (Step)`, `Steps (Expected Result)`, `Priority`, `References`. |
| JSON | API payload `{ cases, sections }` or a raw `cases` array (`custom_preconds`, `custom_steps_separated`, `priority_id`, `section_id`). |
| API | `GET {base}/index.php?/api/v2/get_cases/{projectId}` plus `get_sections`. Basic auth (`email` + API key). |

### Qase

| Source | Shape |
| --- | --- |
| CSV | `id`, `title`, `description`, `preconditions`, `priority`, `status`, `suite`, `tags`, `steps`. `steps` may be a JSON array. |
| JSON | `GET /v1/case/{code}` style `{ result: { entities } }`. Numeric priority `1=high`, status `0=actual`. |
| API | `GET {base}/v1/case/{code}` with `Token` header. Default base `https://api.qase.io`. |

### Zephyr Scale

| Source | Shape |
| --- | --- |
| CSV | SmartBear export. Repeated `Key`/`Name` rows (or blank key) are collapsed into one case using `Test Script (Step-by-Step) - Step` / `Expected Result`. |
| JSON | `{ values: [ { key, name, folder, priority, testScript.steps } ] }`. |
| API | `GET {base}/testcases?projectKey=` with `Authorization: Bearer`. Default base `https://api.zephyrscale.smartbear.com/v2`. |

### Xray

| Source | Shape |
| --- | --- |
| CSV | Jira/Xray export. Rows that share `Issue Key` are one case; `Action` / `Data` / `Expected Result` become numbered steps. |
| JSON | `{ tests: [ { key, summary, steps, preconditions, testRepositoryPath, labels } ] }` or Jira `{ issues: [ { key, fields } ] }`. |
| API | Not supported (Cloud OAuth). Export CSV/JSON from Xray/Jira and upload it. |

## HTTP API

Both routes are session-authenticated, workspace-scoped (project cookie / `x-topology-project-id`), and require `cases.create`.

### `POST /api/import/preview`

JSON or multipart. JSON example:

```json
{
  "provider": "testrail",
  "content": "<suite>…</suite>",
  "mapping": { "title": "title", "key": "id" }
}
```

API example:

```json
{
  "provider": "testrail",
  "api": {
    "baseUrl": "https://example.testrail.io",
    "email": "qa@example.com",
    "token": "api-key",
    "project": "1"
  }
}
```

Multipart fields: `provider`, `file`, optional `mapping` (JSON string), optional `api` (JSON string).

Response includes `sourceFields`, `suggestedMapping`, `mapping`, `counts`, `sampleSourceRows`, `sampleMappedRows`, and `errors`.

### `POST /api/import/run`

Same body as preview, plus `dryRun: true | false`.

Dry run returns `wouldCreate`, `wouldSkip` (existing keys), `sample`, and `errors`. Import returns `created`, `skipped`, and the inserted `{ id, key, title }` rows.

Local, loopback, and private API URLs are rejected (same SSRF rules as outbound webhooks). Redirects are not followed.

Fixtures used by unit tests live in `fixtures/import/`.
