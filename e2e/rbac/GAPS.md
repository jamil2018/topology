# RBAC UI gaps

## Viewers are not redirected

`/cases` and `/runs` render for any signed-in user. A viewer session stays on those pages. `roles.spec.ts` asserts the Test Cases and Test Runs headings.

## Create case control gap resolved

The prior audit found an enabled "New case" control for viewers. The refinement passes effective project actions to the workspace and disables creation for users without `cases.create`. `roles.spec.ts` now passes against the disposable refinement database.

`POST /api/cases` from a viewer session returns 403 `Missing permission: cases.create`. The route enforces the action. The UI now applies the same action capability.
