---
owner: Codex Agent – Frontend Generator
status: draft
last_updated: 2025-10-30
related_prd: ./featurePRD_UIenhancement1.md
---

# Implementation Plan — UI Enhancement Initiative 1 (Rebrand & Shell Refresh)

This document translates the approved PRD into a step-by-step, testable implementation plan using the project’s React (Next.js) + TailwindCSS stack and shadcn/ui components. It emphasizes accessibility (WCAG 2.1 AA), design-system consistency, and responsive behavior across desktop and mobile.

## Objectives (from PRD → build targets)
- Global design tokens: Introduce Deep Navy/Electric Teal palette across light/dark themes with verified AA contrast.
- New application shell: Replace `HeaderBar` with a branded, responsive navigation and remove GitHub link/logo.
- Advanced controls: Relocate technical utilities (export, Odoo verification, tenant override, connection badge) into a secondary surface (Sheet) with clear labels and keyboard access.
- Auth surfaces: Rebuild login/signup using shadcn Card/Form, with helper content, imagery slots, and robust error states.
- Accessibility & responsiveness: Achieve ≥90 Lighthouse a11y on chat/login/signup and ensure mobile-first responsive layouts.

## Deliverables
- Updated theme tokens in `globals.css` and Tailwind config integration.
- New `AppShell` component (brand logo/wordmark, primary nav, advanced controls entry).
- Refactor main routes (`/`, `/candidates`, `/metrics`) to use `AppShell` and remove GitHub link/logo in thread UI.
- Redesigned `login` and `signup` pages with shadcn Card/Form.
- A11y checks (axe/Lighthouse), contrast validation, and keyboard navigation across new surfaces.

## Non-Goals (as per PRD)
- No revamp of candidates/metrics functionality beyond shell/nav integration.
- No backend changes aside from existing auth usage.

---

## Workstreams & Detailed Tasks

### A) Design Tokens & Theming
Goal: Define brand-consistent tokens and propagate them via CSS variables consumed by Tailwind and shadcn/ui.

Files to update:
- `src/app/globals.css` — set CSS custom properties for palette and semantic tokens (light/dark).
- `tailwind.config.js` — ensure colors reference CSS variables and dark mode uses `class` strategy.

Tasks:
1) Define palette tokens
   - Primary brand colors:
     - Deep Navy: `#1D2A4D`
     - Electric Teal: `#00CABA`
     - Cool Gray: `#F5F7FA`
     - Charcoal Gray: `#3A3A3A`
     - White: `#FFFFFF`
   - Map to semantic tokens in `:root` and `.dark` scopes:
     - `--background`, `--foreground`
     - `--primary`/`--primary-foreground`
     - `--secondary`/`--secondary-foreground`
     - `--muted`/`--muted-foreground`
     - `--accent`/`--accent-foreground`
     - `--border`, `--input`, `--ring`
   - Keep existing chart tokens but align accents against new palette for contrast.

2) Contrast validation
   - Use axe/Lighthouse to verify text vs background and interactive states (hover, focus, disabled) meet AA.
   - Adjust `--primary-foreground` and `--secondary-foreground` for sufficient contrast when tinted backgrounds are used.

3) Tailwind linkage
   - Confirm `tailwind.config.js` references `hsl(var(--token))` colors already.
   - Dark mode remains `class`-based; ensure toggled correctly via `html`/`body` class.

Acceptance checks:
- CSS variables set for both light and dark with brand palette.
- Lighthouse a11y contrast audits pass on key views.

### B) Typography & Metadata
Goal: Apply Montserrat (headlines) and Lato (body) via `next/font` and update metadata to new brand.

Files to update:
- `src/app/layout.tsx`

Tasks:
1) Fonts via `next/font/google`
   - Import Montserrat (weights: 600/700) and Lato (400/500) with `display: swap`.
   - Apply Lato to body; create a utility class for Montserrat headings (e.g., `.font-headline`).
   - Use uppercase for short headings where specified (via Tailwind `uppercase` class).

2) Metadata
   - Update `metadata.title` and `metadata.description` to reflect product brand.
   - Add OpenGraph basic fields (title/description) leveraging brand language.

Acceptance checks:
- Fonts load with `preload` and limit weights to reduce CLS and improve performance.
- Headings render in Montserrat and body in Lato across pages.

### C) New Application Shell (Replace `HeaderBar`)
Goal: Introduce branded `AppShell` with primary navigation and move technical controls behind an “Advanced” entry.

Files to add/update:
- Add `src/components/ui/app-shell.tsx` — branded shell using shadcn `Button`, `Sheet`, `DropdownMenu`, `Avatar` (as needed).
- Update `src/app/page.tsx`, `src/app/candidates/page.tsx`, `src/app/metrics/page.tsx` to use `AppShell` and remove `HeaderBar`.
- Update `src/components/thread/index.tsx` to remove GitHub link/logo and slots for brand mark if shown within thread header.

Tasks:
1) Navigation IA
   - Primary: Chat (`/`), Candidates (`/candidates`), Metrics (`/metrics`).
   - Active route styling with accessible indicators (aria-current=”page”).

2) Branding
   - Add brand logo/wordmark slot in `AppShell` left side.
   - Remove GitHub logo/link usages (see `OpenGitHubRepo` in thread header).

3) Advanced controls surface (Sheet)
   - Trigger button labeled “Advanced”. On open, present:
     - Connection badge (read-only status)
     - Export CSV/JSON actions
     - Verify Odoo action with async state
     - Tenant override input + Use/Clear actions (guard behind feature flag `NEXT_PUBLIC_ENABLE_TENANT_SWITCHER`)
     - Sign out action
   - Move existing logic from `src/components/ui/header-bar.tsx` into modular subcomponents used inside the Sheet.
   - Provide helper text for each utility; ensure tab order and keyboard activation (Enter/Space) work.

4) Responsive behavior
   - Mobile: Collapsible nav (Sheet or `DropdownMenu`), Advanced controls bundled in same Sheet.
   - Desktop: Simple top nav + right-aligned Advanced trigger.

Acceptance checks:
- `HeaderBar` no longer rendered on key routes; `AppShell` present.
- Technical utilities accessible via Advanced sheet and not visible by default.
- GitHub link/logo removed from all UI surfaces.

### D) Auth Pages — Login & Signup
Goal: Rebuild with shadcn Card/Form patterns, include helper content/imagery, and strong error states.

Files to update:
- `src/app/login/page.tsx`
- `src/app/signup/page.tsx`

Tasks:
1) Structure with shadcn
   - Wrap in `Card` with `CardHeader`, `CardContent`, `CardFooter`.
   - Use `Label`, `Input`, `PasswordInput`, `Button` components for consistent styling.
   - Provide placeholder imagery slot on the side/top for brand artwork (responsive hide/show).

2) UX states
   - Loading state on submit (disable button + `aria-busy`).
   - Inline error message with role="alert" and clear guidance.
   - Helper links: “Forgot password?” (placeholder link), documentation/support.

3) Accessibility
   - Proper `label htmlFor` and `id` attributes for inputs.
   - Logical focus order; focus first invalid field on error.
   - Keyboard navigation: form submit on Enter; all controls reachable by Tab.

Acceptance checks:
- Login/Signup meet ≥90 Lighthouse a11y.
- Responsive layouts render imagery appropriately and maintain readability.

### E) Accessibility & QA
Goal: Validate accessibility, responsiveness, and regression-proofing.

Tasks:
1) Automated checks
   - Run Lighthouse locally on Chat (`/`), Login (`/login`), Signup (`/signup`). Target ≥90 a11y score.
   - Use axe DevTools or `@axe-core/react` locally during development to catch violations.

2) Keyboard testing
   - Verify Advanced sheet open/close via keyboard; focus trap retained in Sheet; Escape closes.
   - Verify tab order across nav and forms.

3) Contrast audit
   - Validate hover/focus/disabled states for primary/secondary buttons and links.

4) Responsive audit
   - Check breakpoints: 320–375, 390, 414, 768, 1024, 1280+ for nav wrapping, sheet usage, and auth imagery.

5) Error resilience
   - Simulate offline/failed requests on Verify Odoo and export actions; ensure friendly messages.

Acceptance checks:
- All above verifications documented with screenshots or notes in PR.

---

## Step-by-Step Implementation Plan

Phase 1 — Tokens, Fonts, Metadata (Week 1)
1) Add typography in `src/app/layout.tsx`
   - Import Montserrat (headline) and Lato (body) via `next/font/google`.
   - Apply Lato to `<body>`; export a small `fonts.ts` utility if shared.
   - Update `metadata.title`/`description` and basic OG tags.
2) Update theme tokens in `src/app/globals.css`
   - Define brand palette variables for light/dark.
   - Map semantic tokens (`--background`, `--primary`, etc.) to palette with AA contrast.
3) Sanity check
   - Boot app; verify tokens apply across buttons, inputs, and backgrounds.
   - Quick Lighthouse pass for contrast warnings.

Phase 2 — App Shell & Advanced Controls (Week 2)
4) Create `src/components/ui/app-shell.tsx`
   - Add brand logo/wordmark slot; primary nav (Chat, Candidates, Metrics) with active state.
   - Add “Advanced” trigger that opens a `Sheet` containing admin utilities.
   - Extract logic from `header-bar.tsx` into small subcomponents used inside sheet (ConnectionBadge, ExportButtons, VerifyOdoo, TenantOverride, SignOut).
5) Replace usages
   - Update `src/app/page.tsx`, `src/app/candidates/page.tsx`, `src/app/metrics/page.tsx` to import and render `AppShell` instead of `HeaderBar`.
6) Remove GitHub residue
   - In `src/components/thread/index.tsx`, remove `OpenGitHubRepo` and related imports/usages.
7) Responsiveness & a11y
   - Validate mobile: menu collapses to `Sheet`; Advanced remains accessible.
   - Confirm focus management, Escape to close, and screen reader labels.

Phase 3 — Auth Surfaces (Week 3)
8) Rebuild `login` and `signup`
   - Use shadcn Card + labeled inputs + helper text + imagery slot.
   - Add friendly errors and loading states; ensure `role="alert"` for messages.
9) QA & polish
   - Lighthouse and manual axe checks ≥90.
   - Remove any lingering GitHub/logo imports; ensure branding consistent.

---

## Code-Level Change List (by file)

- `src/app/layout.tsx`
  - Replace Inter with Montserrat + Lato via `next/font`.
  - Update `metadata` and `<body>` class to use body font.

- `src/app/globals.css`
  - Update `:root` and `.dark` CSS variables to brand palette.
  - Ensure tokens for `--primary-foreground`, `--secondary-foreground`, etc., meet AA.

- `src/components/ui/app-shell.tsx` (new)
  - Branded shell with nav, Advanced sheet, and accessible labels.
  - Reuse shadcn components: `Button`, `Sheet`, `Separator`, `Tooltip` (as needed).

- `src/app/page.tsx`, `src/app/candidates/page.tsx`, `src/app/metrics/page.tsx`
  - Replace `<HeaderBar />` with `<AppShell />`.

- `src/components/thread/index.tsx`
  - Remove `OpenGitHubRepo` component and its usages/imports.
  - Explicitly replace any LangGraph branding (e.g., `LangGraphLogoSVG`, product name strings) with the new brand logo/wordmark.

- `src/app/login/page.tsx`, `src/app/signup/page.tsx`
  - Switch to shadcn `Card`, `Label`, `Input`, `PasswordInput`, `Button`.
  - Add helper text, support links, role="alert" for errors, loading states.

- `src/components/ui/header-bar.tsx`
  - Deprecate. Move internal utility logic into `AppShell`’s Advanced sheet subcomponents.

---

## Accessibility Checklist (WCAG 2.1 AA)
- Color contrast: All text and icons meet AA on all states (regular, hover, focus, disabled).
- Focus management: Advanced `Sheet` traps focus; close on Escape; return focus to trigger.
- Keyboard: All controls reachable with Tab; Enter/Space activates; nav correctly announces via `aria-current`.
- Labels: `Label` + `id` pairing for inputs; descriptive button text; no icon-only controls without aria-label.
- Errors: Inline errors use `role="alert"`; inputs have `aria-invalid` and `aria-describedby` when applicable.

---

## Testing & Validation
- Unit/light integration
  - Smoke-run components that were refactored; ensure no TS errors and props remain consistent.
- Accessibility
  - Lighthouse ≥90 for `/`, `/login`, `/signup`.
  - Manual axe checks for contrast, landmarks, roles, and focus order.
- Responsiveness
  - Verify at common breakpoints: 360, 390, 414, 768, 1024, 1280.
- Regression checks
  - Chat submission flow unaffected by shell changes.
  - Admin utilities still functional inside Advanced sheet.

---

## Risks & Mitigations
- Contrast regression → run Lighthouse/axe after token updates; adjust foreground tokens.
- Discoverability of Advanced utilities → clear “Advanced” label + helper text inside sheet; mention in release notes.
- Font performance → limit font weights; use `display: swap`; preload critical fonts only.

---

## Rollout & Communication
- Ship behind a short-lived feature flag if needed (e.g., `NEXT_PUBLIC_NEW_SHELL=true`) to enable quick rollback.
- Release notes to internal users covering: new nav, Advanced location, login/signup updates.

---

## Definition of Done
- Design tokens implemented and validated against AA.
- `AppShell` replaces `HeaderBar` on all major routes; GitHub link/logo removed.
- Auth pages rebuilt with shadcn; friendly errors and onboarding aids present.
- Lighthouse a11y ≥90 on chat/login/signup.
- UI aesthetics score ≥ 4/5 in internal UX review.
- Linting passes with no design-system violations; no ad-hoc CSS added.
