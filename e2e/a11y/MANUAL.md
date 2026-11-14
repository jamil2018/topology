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
