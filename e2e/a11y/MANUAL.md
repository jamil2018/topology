# Manual screen reader checks

Chromium is the automated browser. Playwright runs the axe, keyboard, reduced-motion, and reflow specs in Chromium only. VoiceOver on Safari and NVDA on Chrome are manual. A passing Chromium run does not replace these checks.

Sign in with the demo admin for the cases list and the run executor. Sign out before the login checks.

## VoiceOver (Safari)

### Login

- Load `/login` and confirm the page title and the "Topology" heading are announced.
- Tab through the color theme group, then Email, Password, and "Sign in with email". Each field name is announced from its label.
- Submit a wrong password. "Invalid email or password" is announced from the alert.
- Confirm the theme control is a group named "Color theme" and that the active theme is not conveyed by color alone.

### Cases list

- Open `/cases`.
- Confirm navigation named "Primary" and a main region. The heading is "Test Cases", and the heading levels do not skip.
- The search field is named "Search cases". Typing in it does not trigger a go-to shortcut.
- Press `?`. VoiceOver announces the dialog "Keyboard shortcuts". Tab keeps focus inside the dialog. Escape closes it.
- Status and priority are available as text, not color alone.

### Run executor

- Open a run and select a case.
- The case list is named "Run cases". The search field is named "Search cases".
- Pass, Fail, Blocked, Skipped, and Untested announce the case key and the status, for example "Mark KEY as passed", and expose pressed state.
- Notes, comments, and file attachment have names.
- After a result is recorded, the new status is available without relying on color. Live updates, when announced, use a polite live region.

## NVDA (Chrome)

Repeat the login, cases list, and run executor checks in Chrome with NVDA.

- In browse mode, the login heading, Primary landmark, and "Test Cases" heading are reachable. Forms mode announces Email and Password by name.
- On the run executor, each status button name includes the case key and the status, and the pressed state changes after activation.
- Note any control NVDA does not name, any focus loss in the "Keyboard shortcuts" dialog, and any status conveyed only by color.


## Launch workflow audit

Record the candidate SHA and image digest, operator, date, OS, device, browser, screen reader and version. For each item, record expected speech and focus, observed result, and the applicable WCAG 2.2 criterion or defect.

| Workflow | Verify with keyboard and assistive technology |
| --- | --- |
| Setup, invitation, and login | Announce headings, labels, and validation. Check password paste/autofill and recovery on expired invitations and sessions. |
| Case and proposal review | Reach review actions, identify draft and approved revisions, announce validation or stale versions, and return focus after dismissal. |
| Import preview and history | Check file picker, error summary, affected rows, per-run result status, duplicate import, and updated totals. |
| Live execution and exploration | Announce charter, assignment, step status, evidence upload, and incoming changes without stealing focus. Check handoff and failed-save recovery. |
| Jira revision and PR evidence | Identify source revision and suspect links. Reach exact review actions and distinguish missing, stale, passing, and signed-off cells without color. |
| Notifications, graphs, and reports | Reach unread indicators, chart alternatives, filter changes, export actions, shared reports and revocation status. |

Repeat complete primary tasks with VoiceOver/Safari on macOS and NVDA/Chrome on Windows. Repeat login, case finding, result entry, and report access on a physical phone with VoiceOver or TalkBack. Test native 200% and 400% zoom, increased OS text size, forced colors, reduced motion, and text spacing. Check focus under sticky UI, visible actions with the mobile keyboard open, contrast, target sizing, and a pointer alternative for any drag action.
