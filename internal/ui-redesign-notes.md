# Topology UI redesign notes

**Design Read:** Reading this as: redesign of a QA/dev TCM product shell for engineers, with a Linear/Primer-like language, leaning toward dense sidebar app chrome + first-class dark mode (not a marketing landing).

**Dials:** DESIGN_VARIANCE 5 · MOTION_INTENSITY 3 · VISUAL_DENSITY 8 (cockpit).

**Skill note:** tasteskill §13 marks dense product UI out of scope for marketing blocks; applying redesign protocol (§11), dark-mode protocol (§8), and anti-slop rules while keeping HeroUI v3 + Tailwind v4 (user constraint). Aesthetic inspiration: Linear/Primer density, not an official Primer package swap.

## Audit (before)

| Area | Current | Action |
|---|---|---|
| Nav | Sticky top bar, horizontal links | Persistent left sidebar; mobile drawer |
| Theme | Light-only warm paper/cream | System + manual dark/light; persist |
| Type | Fraunces display + Source Sans | Geist + Geist Mono (no Inter, no Fraunces) |
| Density | Marketing hub hero + soft cards | Cockpit metrics strip, hairline rows, status chips |
| Accent | Forest teal `#0f7a5f` | Keep teal accent; cool zinc neutrals (retire cream) |
| IA | Hub / Cases / Runs / Automation / Triage | Preserve routes & labels |

## Shape lock
Radius 6–8px for controls/panels. No pill nav. Status chips use soft radius + mono where IDs/numbers.

## Leftover debt (track)
- Workspace tables still lightly carded; further density pass optional
- HeroUI Chip/Button tokens may need deeper theme overrides
- No keyboard command palette yet (density hint only)
- Cases form Priority/Status/Folder now use HeroUI Select (v3 anatomy)
