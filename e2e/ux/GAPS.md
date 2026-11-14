# UX and responsive gaps

No `toHaveScreenshot` specs are included. There are no baselines yet, and a missing snapshot would fail CI.

## Visual baselines to add later

Capture these at `desktop-1440` in both light and dark. Mask dynamic case keys, run names, counts, dates, ids, and chart values.

- `/` (QA home)
- `/cases`
- `/cases` with the command palette open
- `/cases` with the shortcut cheat sheet open
- `/cases` after a search that matches nothing
- `/runs`
- `/runs/[id]` (run executor)
- `/plans`
- `/triage`
- `/reports`
- `/settings`
- `/automation`

## UX-ERR-001

`/cases` loads through the server component `loadCasesWorkspaceData`. `src/app/(app)/cases/error.tsx` (alert heading “Test cases couldn’t load”, retry button “Try again”, same button name as `RouteError`) renders only when that segment throws during render.

`page.route` can abort or 500 the browser GET for `/cases`, but that response never becomes the segment error boundary. The cases workspace also does not GET `/api/cases` on load, so failing that endpoint does not show the alert. Next.js treats a non-OK RSC payload as a full document navigation.

`e2e/ux/errors.spec.ts` is `test.fixme` with the intended steps. Re-enable it when a failed cases GET mounts that boundary. Do not delete seeded data to force the state.

## Not asserted

- J/K on `/cases` moves the list cursor (`aria-current` on the row in `cases-table.tsx`). It does not move DOM focus. The shortcut is registered for the whole cases workspace and is ignored while an editable control is focused. The spec asserts cursor movement.
- The primary nav does collapse. Below Tailwind `lg` (1024px), `hub-shell.tsx` hides the sidebar (`hidden lg:block`) and shows “Open sidebar” (`lg:hidden`), which opens the drawer. That covers widths under 768. UX-NAV-001 does not apply.
- Plan items not covered by these specs: optimistic rollback when a mutation returns 500, loading skeletons, toast consistency, slow-network and offline recovery, and SSE reconnect. Section 6 items not covered here: dialog fit, table or virtual-list scrolling, and tablet orientation change.
