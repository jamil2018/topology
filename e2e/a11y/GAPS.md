# Accessibility qualifications

Release evaluation runs Chromium across five responsive viewports plus Firefox/WebKit core. Both themes have axe checks with WCAG 2/2.1/2.2 tags; serious and critical findings fail. Minor/moderate findings are attached, never represented as WCAG certification. Color contrast remains enabled.

Login and the authenticated shell contain working skip links. Keyboard tests require the link, verify the first Tab stop, activate it and check that focus reaches the main target. Missing links now fail rather than annotate a conditional pass. Dialog focus trapping and editable-control shortcut exclusion are automated.

VoiceOver requires a human operator on macOS; NVDA requires Windows and a human operator. Execute `docs/test-plan.md` A11Y-SR-001/002 with the isolated debug app and record announcements/focus. Native 200%/400% zoom and OS text settings also remain unqualified; viewport emulation is not native zoom evidence.
