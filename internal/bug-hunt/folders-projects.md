# Folders and projects bug hunt

Date: 2026-09-17. Live `http://127.0.0.1:4317` as `demo@topology.local`. Scope: `src/app/api/folders`, `src/app/api/folders/[id]`, `src/app/api/projects`, and multi-project isolation (cases, runs, folders, members). Entities prefixed `BUGHUNT-FOLDERS-` and `BUGHUNT-PROJECTS-`. No code changes, no server restart, no seed/push/migrate.

Default project `3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf` (`slug: default`). A second owned project `Test` already existed. Hunt projects were created, used, and deleted. One foreign workspace (no membership row) was inserted only so PATCH/DELETE could be aimed at an id the session does not belong to; the exploit itself was HTTP. That row was removed by the IDOR delete.

---

## Highest severity

1. **Any project-only user becomes admin of the default project** — a viewer who existed only on a hunt project, after `GET /`, was an admin of default and `GET /api/cases` returned 87 cases. `ensureMembership` inserts `admin` on the default workspace whenever that row is missing (`src/lib/workspace.ts:40`, `src/app/(app)/layout.tsx:17`). A user with no memberships is joined the same way by `resolveActiveProject` (`src/lib/project.ts:177-178`).
2. **Demo API token files issues into another project** — `POST /api/agent` `create_issue` and `link_issue` load the result by id and write the linked issue into that result's workspace. Token project header was default; the issue landed in the hunt project.
3. **IDOR on project PATCH and DELETE** — `requireProjectAccess` falls back to a project the caller already admins, then the handlers mutate the *requested* id. A project admin renamed and then deleted a workspace they had no membership in. Delete cascades domain data. `PATCH {id, archived:false}` also returns the foreign name and slug without changing anything.
4. **Stale project scope writes into another project** — an unknown or archived `x-topology-project-id` is not rejected. Folder create and CSV import both wrote into the default workspace while the header named another project.
3. **Folder cycles via a race** — one pair of concurrent parent swaps both returned 200 and left `A.parent = B` and `B.parent = A`. `parent_id` has no FK.
4. **Demo API token ignores the project header** — `POST /api/ci/runs` with `Bearer topo_demo_token_local_dev_only` and a non-default project id stored the run in the default workspace. It listed there and not in the requested project.

---

## Confirmed bugs

### 1. PATCH and DELETE `/api/projects` authorize a different workspace than the one they mutate

`src/app/api/projects/route.ts:76` refuses `action=select` unless `access.ctx.project.id === parsed.data.id`. PATCH (`:145-160`) and DELETE (`:186-200`) skip that check. `requireProjectAccess` (`src/lib/project.ts:228-244`) only pins the preferred id when the caller is already a member. Otherwise `pickAccessibleProject` (`src/lib/project.ts:72-81`) returns the first accessible project, `project.manage` passes because the caller is admin *somewhere*, and `updateProject` / `deleteProject` (`src/lib/project.ts:304-328`) run on the raw id. The only extra guard is “cannot delete the default project.”

**Evidence:** workspace `44f6c5d7-0454-4523-b6e6-832144c6a401` had no `workspace_members` row for the demo user. Session scoped to the default project.

- `PATCH /api/projects` `{"id":"44f6c5d7-0454-4523-b6e6-832144c6a401","name":"BUGHUNT-PROJECTS-IDOR …"}` → **200**, name stored as that string.
- `DELETE /api/projects?id=44f6c5d7-0454-4523-b6e6-832144c6a401` → **200** `{"ok":true}`. Row gone.

Contrast: `POST {"action":"select","id":"11111111-1111-4111-8111-111111111111"}` → **403** `No accessible project`.

An admin who still knows a previous project UUID (cookie, invite payload, or a project they were removed from) can rename or delete it and cascade its cases, folders, runs, and members.

### 2. Unknown or archived project id falls back and writes into another project

Same fallback (`src/lib/project.ts:72-81`, `:244`). Folder routes use `access.ctx.project.id`, so they do not IDOR, but they also do not 403 when the header is wrong. The response does not say which project was used.

**Evidence:**

- `GET /api/folders` with `x-topology-project-id: 11111111-1111-4111-8111-111111111111` → **200** and the default project’s folders (`workspaceId` `3f0ddc37-…`, including seed folder `Auth`). Not 403.
- Archived hunt project A, then `POST /api/folders` with `x-topology-project-id` still set to A and name `BUGHUNT-FOLDERS-archived-write …` → **201**. Created folder `7ccf2b0f-0a7d-4d69-961c-57bb700b5cba` had `workspaceId` of the **default** project, not A. It was listed under default and not under B.

A client that still sends an archived or revoked project id contaminates whichever project sorts first for that user.

### 3. Concurrent folder moves create a cycle

`wouldCreateFolderCycle` (`src/lib/folder-tree.ts:92-108`) is correct for a single request, and a lone self-parent or descendant-parent is rejected (`src/app/api/folders/[id]/route.ts:81-96`). The check and the update (`:119-124`) are not in one transaction, and `folders.parent_id` is not a foreign key (`src/db/schema.ts:212`).

**Evidence:** two sibling folders, then 12 attempts of parallel `PATCH` swapping parents. Attempt 0 both returned 200:

- `d2995df1-4281-409e-a78c-05aa6b514b15` (`cycA`) `parentId` = `71481aae-0d3e-434e-9090-40c3b1f32e11`
- `71481aae-…` (`cycB`) `parentId` = `d2995df1-…`

`buildFolderTree` (`src/lib/folder-tree.ts:19-28`) only emits roots. Each node’s parent is the other, so the cycle is absent from the cases folder tree even though `GET /api/folders` still returns both rows.

### 4. Demo API token always writes runs into the default workspace

`authenticateCiRequest` (`src/lib/ci-auth.ts:35-47`) matches `TOPOLOGY_API_TOKEN` and sets `workspaceId` from `ensureDefaultWorkspace()`. It does not read `x-topology-project-id`. `POST /api/ci/runs` (`src/app/api/ci/runs/route.ts:65`) stores that id.

**Evidence:** Bearer `topo_demo_token_local_dev_only`, header set to hunt project B `41edfb5f-ac11-4af7-ac47-5db7574b88d8`, body name `BUGHUNT-PROJECTS-token-run …` → **201** with `workspaceId` `3f0ddc37-…` (default). `GET /api/runs` on B did not include it; `GET /api/runs` on default did. Session-scoped `POST /api/runs` with a matching header did stay in the requested project (see coverage). DB-stored tokens were not probed; this is the documented local demo token.

### 5. Duplicate folder names under one parent

Uniqueness is a check-then-insert (`src/app/api/folders/route.ts:76-103`). There is no unique index on `(workspace_id, parent_id, lower(name))`.

**Evidence:** 8 parallel POSTs of the same name under one parent: **5× 201**, 3× 409. Five rows shared the name and parent.

Deleting a parent promotes children to root with no name check (`src/app/api/folders/[id]/route.ts:163-169`). A child named the same as an existing root folder became a second root with that name (`rootDupes=2`). Cases in the deleted folder were unfiled (`folderId` null), not leaked.

ASCII case-folding does reject duplicates (second create `DUP` vs `dup` → 409). Turkish `İ` vs JS `toLowerCase()` (`i` + combining dot) both returned 201 at the same parent, because the check compares SQL `lower(name)` to a JS-lowercased parameter (`src/app/api/folders/route.ts:82`).

### 6. Whitespace-only project name is stored as empty

`createSchema` / `patchSchema` use `z.string().min(1)` with no trim (`src/app/api/projects/route.ts:18`, `:24`). `createProject` and `updateProject` trim after that (`src/lib/project.ts:286`, `:311`).

**Evidence:**

- `POST /api/projects` `{"name":"   "}` → **201**, `name: ""`, slug `bughunt-empty-…`.
- `PATCH /api/projects` `{"id":"<hunt A>","name":"   "}` → **200**, `name: ""`.

Folder create with `"   "` correctly returned 400 `Folder name is required` (`src/app/api/folders/route.ts:11` trims before `min(1)`).

### 7. NUL in names, and invalid JSON on project write, return an empty 500

- `POST /api/folders` and `POST /api/projects` with a NUL in `name` → **500**, body length 0. Zod does not reject `\u0000` (`src/app/api/folders/route.ts:11`, `src/app/api/projects/route.ts:18`). The client does not get the handler’s JSON error.
- `POST /api/projects` with body `{` → **500**, body length 0. `request.json()` at `src/app/api/projects/route.ts:62` is not in try/catch (same for PATCH at `:136`). Folder routes catch invalid JSON and return 400.

### 8. Folder names may contain the path separator

`POST /api/folders` accepted `BUGHUNT-FOLDERS-a / b …` (201). `folderPathLabel` joins ancestors with `" / "` (`src/lib/folder-tree.ts:57-71`) and is what the case picker shows (`src/components/cases-workspace.tsx:1018`). A name containing ` / ` is indistinguishable from a nested path.

---

## Coverage (held)

| Attempt | Result |
| --- | --- |
| Parent = self | 400 `Cannot move a folder into itself or a descendant` |
| Parent = grandchild | 400 same message |
| Parent id from project A while creating in B | 404 `Parent folder not found` |
| PATCH/DELETE folder id from A with header B | 404 both; name unchanged in A |
| Case in B with `folderId` from A | 400 `Folder not found` |
| PATCH/POST case into a deleted folder id | 400 `Folder not found` |
| Delete folder that has a case | 200; case remains in the same project with `folderId` null |
| Folder list isolation | A’s folder id absent from B’s list |
| Case list / GET by id across projects | not listed; cross GET 404. Same case key allowed in both projects (201/201) |
| Run list isolation; run in B with case id from A | no leak; 400 `One or more case ids are invalid` |
| Invite on A, GET `/api/workspace` on B | invite not listed; workspace ids differ |
| Create / select / rename owned projects | 201 / 200; header overrides cookie; rename of B while header is A changed only B |
| Delete default project | 400 `Cannot delete the default project` |
| Delete non-default project | 200; cookie reset to default id; cases, folders, runs, and members for that id gone (0 leftover rows); orphan title not listed in default |
| Empty / 121-char folder name | 400 |
| Same-parent duplicate, different ASCII case | 409 |
| Deep nesting | 40 sequential children all 201; `GET /api/folders` 200 (55 folders). No depth cap and no server error at 40. Not filed — nothing broke. |
| Slash in project name | 201; slug hyphenated. Not a defect by itself. |

---

## Round 2 (harder isolation)

Throwaway users were inserted with a password hash, logged in over HTTP, then deleted. Hunt projects and `BH-HARD-*` rows were removed. Counts after cleanup: users 0, cases 0, folders 0, hunt workspaces 0, hunt issues 0.

### 9. A project-only viewer is joined to the default project as admin

`ensureMembership` (`src/lib/workspace.ts:38-80`) inserts a membership on the workspace with `slug = default` whenever the user has none. The default role argument is **`admin`** (`:40`). Callers:

- App layout (`src/app/(app)/layout.tsx:17`) runs on every authenticated page.
- `resolveActiveProject` (`src/lib/project.ts:176-178`) runs it when `listUserProjects` is empty, which `GET /api/projects` does (`src/app/api/projects/route.ts:44-46`).

**Evidence:**

- User with zero memberships: `GET /api/projects` returned `projects: []` but `activeProjectId` of the default project and `canManage: true`. The next `GET /api/cases` with that project id returned **200** and **87 cases**.
- Invitee accepted a viewer invite to hunt project `a786b5b8-7c6c-4293-9c56-fe1ea4bed087` only. `GET /api/projects` then listed just that project as `viewer` and did **not** include default. `GET /` returned 500, but `ensureMembership` had already run: the following `GET /api/projects` listed default with `role: admin`, and `GET /api/cases` on default returned **200** and **87 cases**.

Cross-project role ids are rejected (`POST /api/workspace` with a viewer role id from the other project → 404 `Role not found`). Accepting the invite by itself does not add the default membership; the next app-layout or empty-project resolve does.

### 10. Agent issue actions ignore the token workspace

`POST /api/agent` authenticates the bearer token, then `create_issue` (`src/app/api/agent/route.ts:301-304`) and `link_issue` call `createIssueFromResult` / `linkExistingIssue` without comparing `authResult.workspaceId`. Those functions load `run_results` by id only (`src/lib/issues.ts:57-66` and `:144-151`) and insert `linked_issues` into the result's workspace. They also mark triage for that result resolved.

**Evidence:** failed result `35c92495-fbb8-4ad3-a11f-149769820024` in hunt project `a786b5b8-…`. Demo token, header set to the default project:

- `create_issue` provider `mock` → **200**. Linked issue `728b97d0-bd25-481d-8621-72915ea72289` stored with `workspaceId` of the hunt project, not default.
- `link_issue` `remoteKey` `BH-…` → **200**. Second `linked_issues` row, same foreign `workspace_id`.

JUnit submit of that same run id with the demo token correctly returned **404** `Run not found` (`src/app/api/ci/junit/route.ts:58-65` checks token workspace). The issue path does not.

Same token, `create_case` with the hunt project header stored the case in default (`workspaceId` `3f0ddc37-…`). That is the env-token binding already noted in bug 4 (`src/lib/ci-auth.ts:42`), now also confirmed for cases.

### 11. Extra IDOR and fallback repros

- `PATCH /api/projects` `{id: <no-membership uuid>, archived: false}` → **200** with that workspace's name `BUGHUNT-PROJECTS secret-name …` and slug `bughunt-secret-…`. Nothing needed to change; the response is a metadata read. Same missing id check as bug 1 (`src/app/api/projects/route.ts:165-172`).
- `POST /api/import/csv` with `x-topology-project-id: 11111111-1111-4111-8111-111111111111` and a `BH-HARD-CSV-…` row → **200** `created: 1`. The case and its folder were inserted into the **default** project (`src/app/api/import/csv/route.ts:51-58`, `:124-128`). Same fallback as bug 2, but the payload is a case, not only a folder.
- CSV export scoped to the hunt project included the hunt case and the default export did not.
- Milestone create in default with a folder id from the hunt project → 400 `Folder not found`.
- Deleting one side of a parent-swap cycle set the other folder's `parent_id` to null (promote-children path). No dangling parent on a 2-cycle.

## Leftover probe data

Hunt projects and the default-project folder created by the archived-header write were deleted. The token run in default was deleted. `BUGHUNT-CSV-Folder` and `BUGHUNT-CSV-NewFolder-DoesNotExist` in project Test were recreated after a cleanup pass matched the `BUGHUNT` prefix (new ids; any cases that had been in the old rows would have been unfiled). Round 2 throwaway users, hunt projects, `BH-HARD-*` cases, and linked issues were deleted; leftover counts were 0.

```json
[
  {
    "id": "project-idor-patch-delete",
    "severity": "critical",
    "title": "PATCH and DELETE /api/projects mutate a workspace the caller does not belong to",
    "area": "projects",
    "file": "src/app/api/projects/route.ts:157",
    "repro_summary": "As a project admin, PATCH /api/projects {id: <uuid with no membership>} returns 200 and renames it. DELETE /api/projects?id=<that uuid> returns 200 and removes it (cascade). requireProjectAccess falls back to an accessible project; updateProject/deleteProject use the requested id. Select correctly 403s the same unknown id."
  },
  {
    "id": "project-scope-fallback-wrong-write",
    "severity": "high",
    "title": "Unknown or archived project id falls back and writes folders into another project",
    "area": "projects",
    "file": "src/lib/project.ts:81",
    "repro_summary": "GET /api/folders with a bogus x-topology-project-id returns 200 and the first accessible project's folders. Archive project A, then POST /api/folders with that id still in the header: 201 creates the folder in the default workspace, not A."
  },
  {
    "id": "folder-cycle-race",
    "severity": "high",
    "title": "Parallel parent swaps persist a folder cycle",
    "area": "folders",
    "file": "src/app/api/folders/[id]/route.ts:81",
    "repro_summary": "Create two root folders. Simultaneously PATCH each parentId to the other. Both can return 200 and leave A.parent=B and B.parent=A. parent_id has no FK. The cycle check is not transactional. Single-threaded self and descendant moves are rejected."
  },
  {
    "id": "demo-token-ignores-project",
    "severity": "high",
    "title": "Demo API token ignores project scope and writes runs into the default workspace",
    "area": "projects",
    "file": "src/lib/ci-auth.ts:42",
    "repro_summary": "POST /api/ci/runs with Bearer topo_demo_token_local_dev_only and x-topology-project-id set to a non-default project returns 201 with workspaceId of the default project. The run lists under default and not under the requested project."
  },
  {
    "id": "folder-duplicate-name-race",
    "severity": "medium",
    "title": "Concurrent creates insert duplicate folder names",
    "area": "folders",
    "file": "src/app/api/folders/route.ts:76",
    "repro_summary": "Eight parallel POSTs of the same name under one parent: five returned 201. Uniqueness is check-then-insert with no unique index."
  },
  {
    "id": "delete-folder-duplicate-names",
    "severity": "medium",
    "title": "Deleting a folder promotes children and can duplicate a root name",
    "area": "folders",
    "file": "src/app/api/folders/[id]/route.ts:163",
    "repro_summary": "Create root folder Alpha and parent P with child Alpha. DELETE P. The child is reparented to null with no name check, so two root folders share the name. Cases in P are unfiled, not moved to another project."
  },
  {
    "id": "project-empty-name",
    "severity": "medium",
    "title": "Whitespace-only project name is stored as an empty string",
    "area": "projects",
    "file": "src/app/api/projects/route.ts:18",
    "repro_summary": "POST /api/projects {\"name\":\"   \"} returns 201 with name \"\". PATCH {\"name\":\"   \"} does the same. Zod min(1) does not trim; createProject/updateProject trim afterward."
  },
  {
    "id": "folder-unicode-case-duplicate",
    "severity": "low",
    "title": "Unicode case folding mismatch allows duplicate folder names",
    "area": "folders",
    "file": "src/app/api/folders/route.ts:82",
    "repro_summary": "POST a root folder named with Turkish İ plus a suffix, then POST the JS toLowerCase() of that name at the same parent. Both return 201 because SQL lower() does not match the JS-lowercased parameter."
  },
  {
    "id": "name-null-or-invalid-json-500",
    "severity": "low",
    "title": "NUL in a name, or invalid JSON on project write, returns an empty 500",
    "area": "folders",
    "file": "src/app/api/projects/route.ts:62",
    "repro_summary": "POST /api/folders or /api/projects with a NUL in name returns an empty 500. POST /api/projects with body `{` also returns an empty 500 because request.json() is uncaught. Folder invalid JSON is 400."
  },
  {
    "id": "folder-slash-path-ambiguous",
    "severity": "low",
    "title": "Folder names containing ' / ' collide with path labels",
    "area": "folders",
    "file": "src/lib/folder-tree.ts:57",
    "repro_summary": "POST /api/folders accepts a name containing ' / '. folderPathLabel joins ancestors with the same separator, so the case picker cannot tell that name from a nested path."
  },
  {
    "id": "default-project-auto-admin",
    "severity": "critical",
    "title": "A user who only belongs to another project is joined to the default project as admin",
    "area": "projects",
    "file": "src/lib/workspace.ts:40",
    "repro_summary": "Create a user, invite them as viewer to a non-default project, and accept the invite. GET /api/projects lists only that project. Then GET / (app layout) or, for a user with zero memberships, GET /api/projects. ensureMembership inserts an admin row on the default workspace. GET /api/cases on default then returned 87 cases."
  },
  {
    "id": "agent-issue-ignores-token-workspace",
    "severity": "critical",
    "title": "Demo API token can file or link issues on a result in another project",
    "area": "projects",
    "file": "src/app/api/agent/route.ts:301",
    "repro_summary": "POST /api/agent {action:create_issue or link_issue, resultId} with the demo bearer token. The result is loaded by id with no token-workspace check. create_issue returned 200 and stored the linked issue in the result's project, not the token's default workspace. JUnit submit of that same run id correctly 404s."
  },
  {
    "id": "project-idor-metadata-read",
    "severity": "high",
    "title": "PATCH /api/projects returns another workspace's name and slug without membership",
    "area": "projects",
    "file": "src/app/api/projects/route.ts:165",
    "repro_summary": "PATCH /api/projects {id: <uuid with no membership>, archived: false} returns 200 including that workspace's name and slug. Access falls back to a project the caller admins; updateProject still uses the requested id."
  },
  {
    "id": "csv-import-fallback-workspace",
    "severity": "high",
    "title": "CSV import with an unknown project id writes cases into another project",
    "area": "projects",
    "file": "src/app/api/import/csv/route.ts:51",
    "repro_summary": "POST /api/import/csv with a bogus x-topology-project-id returns 200 and inserts the case and folder into the first accessible project (default), not a 403."
  }
]
```
