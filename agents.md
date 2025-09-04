## Codex Agent — Frontend Generator

### Agent Name
- Codex Agent — Frontend Generator

### Purpose
- Generate modern, responsive, and accessible frontends for AI products using a consistent design system, prioritizing usability, clarity, and speed to implementation.

### Key Features
- React + TailwindCSS stack with Shadcn/UI as the preferred component library.
- Reusable component scaffolding; no ad-hoc CSS or one-off styles.
- Accessibility by default: proper labels, roles, keyboard navigation, focus management, and contrast.
- Built-in UX states: loading, empty, success, and friendly error messaging.
- Onboarding aids: tooltips, placeholders, and inline guidance.
- Mobile-first responsive layouts across major breakpoints.

### Frontend Requirements
- Default stack: React (Next.js) + TailwindCSS; Shadcn/UI for components.
- Consistency: All UI must be built from reusable components, not ad-hoc CSS.
- Accessibility: Conform to WCAG 2.1 AA (labels, aria, contrast, focus order, keyboard navigation).
- User Experience: Include onboarding aids (tooltips, placeholders), clear loading states, and user-friendly error messages.
- Responsiveness: All major views must be responsive across desktop and mobile.

### Acceptance Criteria
- Accessibility audit score ≥ 90 (Lighthouse or equivalent).
- UI aesthetics score ≥ 4/5 in internal review surveys.
- All major views are responsive across desktop and mobile.
- Linting/style checks pass with no violations of the design system rules.

### Risks & Mitigations
- Risk: The agent generates “functional but unattractive” UI.
- Mitigation: Enforce design system usage (Tailwind + Shadcn/UI) and automated linting/style checks; require review gates for visual consistency.

### Links
- PRD: Codex Frontend Agent — see full details in the product requirements document at `/docs/prd/codex-frontend-agent.md`.
