# Accessibility gaps

Chromium is the automated browser. These notes are for the Playwright specs in this folder. No axe rules are disabled. `color-contrast` stays enabled. Disable a rule only when a third-party widget makes the suite unusable, and record the rule id and the reason here.

Minor and moderate axe violations do not fail `routes.spec.ts`. They are attached to the test as `axe-minor-moderate` annotations when the spec runs. They were not copied into this file because the suite was not executed: nothing was listening on `127.0.0.1:4317`, and a server was not started.

## A11Y-SKIP-001

No skip link is rendered. A search of `src/` found no "skip to" link. The signed-in shell in `src/components/hub-shell.tsx` exposes `<nav aria-label="Primary">` and `<main>`, and the login page exposes the email form, with no link before them that moves focus to the main content.

`e2e/a11y/keyboard.spec.ts` asserts a skip link only when one is present (first Tab stop, `href` to an id, Enter moves focus to that target). Until a link exists, the spec records this gap and does not fail.

Affected pages: `/login`, `/cases`, and the rest of the signed-in shell.

Expected: the first Tab stop is a link such as "Skip to main content" that moves focus to the primary main landmark.
