# Importing cases

Topology can import test cases from TestRail, Qase, Zephyr Scale, and Xray into the current project. Native CSV import/export is unchanged (`/api/import/csv`).

Open **Test Cases → CSV → Import TestRail / Qase / Zephyr / Xray**, or go to `/cases/import`. The command palette action is **Import cases**. Both preview and import require the `cases.create` permission.

Vendor credentials are used for that request only. They are not stored.

## Flow

1. Choose a provider and upload an export (or, for TestRail / Qase / Zephyr Scale, call their API).
2. **Preview mapping** returns source column names, a suggested mapping onto Topology fields, counts, and up to five sample rows. Nothing is written.
3. Adjust the mapping if a column was guessed wrong.
4. **Dry run** applies the mapping, reports how many cases would be created, and lists keys that already exist. Still no writes.
5. **Import cases** inserts new cases. Existing keys in the project are skipped. Folder paths such as `Auth / Recovery` create nested folders. A flat folder from an earlier vendor import is reused when its full name matches.

Duplicate keys or source IDs inside the file are skipped. A persisted source ID detects reimports after a local case key change. Pass the same `sourceNamespace` for repeated uploads from one source project, and a distinct namespace for a different source project. API imports default to the configured base URL and project.

## Topology fields

| Field | Notes |
| --- | --- |
| `key` | Unique per project. Generated as `TR-n` / `QS-n` / `ZE-n` / `XR-n` when blank. TestRail numeric ids become `C1`. |
| `title` | Required. |
| `description` | Free text. |
| `preconditions` | Free text. |
| `steps` | Structured vendor steps are stored with separate action, data, and expected result fields where available. Text-only formats remain supported. |
| `expectedResult` | Plain text. Per-step expected results are numbered and joined. |
| `priority` | `P0`–`P3`. Vendor labels such as Critical / High / Medium / Low are mapped. |
| `status` | `draft`, `ready`, `blocked`, `deprecated`. |
| `folder` | Matched by name (case-insensitive); created if missing. |
| `tags` | Split on `;` or `,`. |

## Formats

### TestRail

| Source | Shape |
| --- | --- |
| XML | Suite export (`<suite> / <sections> / <section> / <cases> / <case>`). Reads `custom/preconds`, `custom/steps_separated`, or text `custom/steps`. Nested sections retain their hierarchy. |
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

Dry run returns `wouldCreate`, `wouldSkip` (existing keys), `sample`, and `errors`. Import returns `created`, `skipped`, and the inserted `{ id, key, title }` rows. Both apply and dry run include `skipDetails` for source identity, case-key, and in-file conflicts. Write failures appear in apply results.

Local, loopback, and private API URLs are rejected (same SSRF rules as outbound webhooks). Redirects are not followed.

Fixtures used by unit tests live in `fixtures/import/`.

## Historical TestRail and Qase runs

Open Test cases → Import cases → Import run history. Upload a JSON bundle with completed source runs, their result records, and the downloaded bytes for attachments. Use the same source namespace as the case import. File imports without a namespace use `file`. For an API-based case import, set an explicit namespace when importing the cases so it can be reused here.

The bundle supports up to 50 runs and 8 MiB total. Include a separate entry for each run and combine paginated result responses into its `results` array. TestRail bundles also include the run's `get_tests` records. Qase bundles use the inner records from the v1 run and result responses. [TestRail run API](https://support.testrail.com/hc/en-us/articles/7077874763156-Runs) · [TestRail result API](https://support.testrail.com/hc/en-us/articles/7077819312404-Results) · [Qase run model](https://github.com/qase-tms/qase-api-client/blob/main/docs/Model/Run.md) · [Qase result model](https://github.com/qase-tms/qase-api-client/blob/main/docs/Model/Result.md)

```json
{
  "provider": "testrail",
  "sourceNamespace": "checkout-legacy",
  "statusMapping": { "4": "untested" },
  "runs": [{
    "run": {
      "id": 89,
      "name": "Checkout regression",
      "is_completed": true,
      "created_on": 1700000000,
      "completed_on": 1700000300
    },
    "tests": [{ "id": 13, "case_id": 42, "title": "Retain the cart" }],
    "results": [{
      "id": 101,
      "test_id": 13,
      "status_id": 5,
      "created_on": 1700000100,
      "comment": "Cart disappeared",
      "elapsed": "1m 2s"
    }],
    "expected": { "results": 1, "attachments": 1 },
    "attachments": [{
      "id": 501,
      "resultId": 101,
      "filename": "console.log",
      "contentType": "text/plain",
      "dataBase64": "Y2FydCBlbXB0eQ=="
    }]
  }]
}
```

For Qase, set `provider` to `qase`. Supply `run.id`, `run.title`, and `run.end_time`. The importer accepts a completed status and reads the optional `start_time` and environment title. Each result needs `hash`, `run_id`, `case_id`, and `status`. Include ISO timestamps with a time zone and durations in `time_spent_ms`. Attachments use the result hash as `resultId`. Supply downloaded attachment bytes in base64 at up to 1 MiB per file. The importer reads attachment bytes directly from the bundle.

Preview reports each run's result and attachment counts, unavailable case links, and skipped runs. Supply optional `expected` counts to check the bundle against the source export totals. Add explicit `statusMapping` entries for custom statuses before import. Supported target statuses include `passed`, `failed`, `blocked`, `skipped`, and `untested`. A run with an unsupported status, missing result record, or declared attachment without bytes stays skipped until the bundle is corrected. Results with a missing or ambiguous case association import without a catalog link. Links use the case import's provider, namespace, and source ID.

Apply saves each run in its own transaction. Uploading the same bundle again resumes failed runs and returns links to identical completed imports. A different snapshot of an already-imported source run is reported as a conflict. Imported runs preserve source result IDs, timestamps, status, notes, and supported attachments. They carry historical provenance and lack a verified case revision or CI commit.

The API accepts the raw JSON bundle at `POST /api/import/history?mode=preview`. Resubmit it to `POST /api/import/history?mode=apply&digest=…` with the preview digest. Applying requires `cases.view`, `runs.create`, and `runs.edit`. Responses report each run's outcome so operators can reconcile partial progress. Apply migration `0015_vendor_run_history` during upgrade.
