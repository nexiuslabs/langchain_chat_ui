---
owner: Codex Agent – Frontend Generator
status: draft
last_updated: 2025-10-30
source: ./featureDevplanPRD_UIenhance1.md
---

# To‑Do List — UI Enhancement Initiative 1 (Rebrand & Shell Refresh)

A checkpoint-style task list derived from the detailed implementation plan. Use this for execution tracking and review gates.

## Pre‑work
- [ ] Confirm brand assets delivery (logo/wordmark, imagery, copy).
- [ ] Confirm font licensing/availability (Montserrat + Lato) and weights.
- [ ] Approve navigation IA and Advanced controls contents.
- [ ] Set up Lighthouse/axe workflow for local a11y checks.

## A) Design Tokens & Theming
- [x] Define brand palette tokens in `src/app/globals.css` for light/dark:
  - [x] Deep Navy background (dark) and Cool Gray background (light)
  - [x] Electric Teal as `--primary` and ring color
  - [x] Charcoal Gray and White foregrounds with AA contrast
- [x] Map semantic tokens: `--background`, `--foreground`, `--primary[-foreground]`, `--secondary[-foreground]`, `--muted[-foreground]`, `--accent[-foreground]`, `--border`, `--input`, `--ring`.
- [ ] Validate button/link hover/focus/disabled state contrast (axe/Lighthouse AA).
- [x] Confirm `tailwind.config.js` color mapping and `darkMode: "class"` behavior.

## B) Typography & Metadata
- [x] Integrate fonts via `next/font`:
  - [x] Montserrat (headlines) limited weights (600/700)
  - [x] Lato (body) weights (400/700); `display: swap`
- [x] Apply Lato to `<body>`
- [ ] Add class/utility for Montserrat headings; use `uppercase` for short headings.
- [x] Update `metadata.title`/`description` and OpenGraph fields.
- [x] Quick perf sanity: limit weights, preload critical only.

## C) App Shell & Advanced Controls
- [x] Create `src/components/ui/app-shell.tsx` with brand wordmark and primary nav:
  - [x] Nav items: Chat (`/`), Candidates (`/candidates`), Metrics (`/metrics`)
  - [x] Active state with `aria-current="page"`
- [x] Implement Advanced controls in a `Sheet`:
  - [x] Connection badge (read-only status)
  - [x] Export CSV/JSON actions
  - [x] Verify Odoo action with async state and notes
  - [x] Tenant override (feature-flagged: `NEXT_PUBLIC_ENABLE_TENANT_SWITCHER`)
  - [x] Sign out (Keycloak-compatible; falls back to `/login`)
  - [x] Helper text; enter/space activation; logical tab order
- [x] Replace `HeaderBar` with `AppShell` on `/`, `/candidates`, `/metrics`.
- [x] Remove GitHub link/logo across UI; remove GitHub repo entry points.
- [x] Replace any LangGraph branding (e.g., `LangGraphLogoSVG`, product strings) with new brand mark.
- [x] Keep `header-bar.tsx` deprecated or remove once migration is stable.

## D) Auth Pages — Login & Signup
- [ ] Rebuild with shadcn Card/Form:
  - [x] Use CardHeader/Content/Footer
  - [ ] Add responsive imagery slot
  - [x] Inputs with `Label` + `id` pairing
  - [ ] Use `PasswordInput` where applicable
  - [x] Submit loading state; `aria-busy`; disable button on submit
  - [x] Inline error with `role="alert"` and clear copy
  - [x] Helper link: Forgot password (placeholder)
  - [ ] Helper link: Support/docs
  - [x] Focus first invalid field on error

## E) Accessibility, Responsiveness, QA
- [ ] Lighthouse a11y ≥ 90 on `/`, `/login`, `/signup`.
- [ ] Keyboard checks:
  - [ ] Advanced `Sheet` traps focus; Escape closes; focus returns to trigger
  - [ ] Tab order predictable across nav and forms; Enter submits
- [ ] Responsive checks at 360, 390, 414, 768, 1024, 1280:
  - [ ] Nav wraps gracefully; mobile uses `Sheet`
  - [ ] Auth imagery toggles sensibly by breakpoint
- [ ] Error resilience: simulate offline/failed export and Odoo verify; show friendly notes.

## Success Metrics & Review Gates
- [ ] Accessibility score ≥ 90 (Lighthouse) on updated views.
- [ ] UI aesthetics score ≥ 4/5 in internal UX review.
- [ ] Reduction in support feedback about confusing header controls (post-release monitoring).

## Definition of Done
- [ ] Brand tokens implemented with AA contrast in light/dark.
- [x] `AppShell` fully replaces `HeaderBar`; GitHub and LangGraph branding removed.
- [x] Auth pages rebuilt with onboarding aids, error states, and labels.
- [ ] Lighthouse a11y ≥ 90 on chat/login/signup; keyboard/focus checks verified.
- [ ] Lint/style checks pass; no ad-hoc CSS outside components.

## Rollout & Post‑merge
- [ ] Optional feature flag (`NEXT_PUBLIC_NEW_SHELL=true`) for staged rollout.
- [ ] Release notes explaining new nav, Advanced location, and auth updates.
- [ ] Optional cleanup: remove deprecated `header-bar.tsx` and unused icons after stability window.
