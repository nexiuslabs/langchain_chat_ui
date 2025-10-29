---
owner: Codex Agent – Frontend Generator
status: approved
last_reviewed: 2025-02-15
---

# UI Enhancement Initiative 1 – Rebrand & Shell Refresh

## Summary
Deliver a cohesive visual identity and onboarding experience for the chat application by rebranding global theming, replacing the inherited LangGraph shell with a product-specific navigation system, modernizing authentication surfaces, and relocating technical utilities into a secondary control surface. The work removes residual LangGraph branding (including the GitHub logo/link), introduces the Deep Navy/Electric Teal palette, and establishes typography aligned with the new brand voice.

## Goals & Objectives
- Establish brand-consistent design tokens (color, typography, metadata) across light/dark themes.
- Replace the template header with a bespoke application shell that prioritizes end-user navigation and hides technical utilities behind an "Advanced" control.
- Provide polished login and signup experiences using shadcn Card/Form compositions with helper content and brand imagery.
- Improve perceived simplicity by relocating technical buttons (export, Odoo verification, tenant override) into a dropdown or sheet while keeping them accessible for administrators.
- Remove the GitHub logo/link from the top-right corner to eliminate template residue.

## Non-Goals
- Revamping candidates/metrics data tooling beyond shell integration.
- Overhauling onboarding funnels beyond the login/signup surfaces described.
- Backend or API changes outside of those required to surface existing auth functionality.

## User Story
As a recruiting workspace user, I want the chat UI to reflect our brand and present only relevant controls upfront so that I feel confident using the product without being overwhelmed by technical options.

## Acceptance Criteria
1. Global CSS variables and Tailwind tokens use the Deep Navy (#1D2A4D), Electric Teal (#00CABA), Cool Gray (#F5F7FA), White (#FFFFFF), and Charcoal Gray (#3A3A3A) palette with WCAG AA contrast for text and interactive elements.
2. Typography employs the chosen headline (e.g., Poppins/Montserrat) and body (e.g., Roboto/Lato) fonts via `next/font`, with uppercase styling for short headings and updated metadata reflecting the product brand.
3. A new app shell component replaces `HeaderBar` across primary routes, featuring brand logo/wordmark, primary navigation, responsive behavior, and no GitHub link/logo.
4. Technical utilities (CSV/JSON export, Odoo verification, tenant override, connection badge) reside within an “Advanced” dropdown or equivalent secondary menu that is accessible but not immediately visible.
5. Login and signup pages render shadcn Card/Form compositions with helper text, error handling, brand imagery slots, and links to documentation/support.
6. Experiences satisfy responsive behavior (desktop/mobile) and pass automated accessibility checks (≥90 score) for updated views.

## Dependencies
- Brand assets: logos/wordmarks, imagery, and finalized marketing copy for metadata.
- Font licensing/availability for the selected headline and body typefaces.
- Product/UX approval for navigation IA and the content displayed within the advanced controls menu.
- Accessibility tooling (e.g., Lighthouse, axe) to validate contrast and compliance.

## Assumptions
- Existing authentication APIs and validations remain unchanged and can be reused in the redesigned forms.
- Administrative utilities can be safely moved behind a secondary control without breaking workflows (users with access will know where to find them).
- No additional pages require re-theming beyond those specified; other pages will inherit the global tokens naturally.

## Risks
- **Contrast regression** if the new palette is not rigorously checked across states (hover, focus, disabled).
- **Navigation discoverability** concerns if advanced utilities are hidden too deeply; mitigated through clear labeling and helper text in the menu.
- **Font performance** impact due to additional typefaces; requires font optimization and limited weight usage.

## Decisions
1. **Advanced controls disclosure pattern** – Use a `Sheet` on desktop and mobile to present the administrative utilities. This aligns with Option B from the evaluation, maximizing space for labels, helper descriptions, and future additions.
2. **Typography pairing** – Standardize on Montserrat for headlines (uppercase for short headings) and Lato for body copy, adopting the Option B recommendation to balance geometric character with readability.
3. **Auth imagery approach** – Ship with curated placeholder imagery for login and signup cards so the layouts feel complete while awaiting bespoke assets; replace imagery once final brand illustrations arrive.

## Success Metrics
- ≥90 Lighthouse accessibility score on chat, login, and signup routes post-update.
- ≥4/5 aesthetic rating in internal UX review.
- Reduction in support feedback related to confusing technical controls in the main header.

## Timeline & Milestones
- **Week 1:** Finalize tokens, typography, and metadata updates; validate contrast.
- **Week 2:** Implement new app shell, advanced controls menu, and remove GitHub link/logo across routes.
- **Week 3:** Rebuild login/signup forms with onboarding content; complete accessibility/responsiveness QA.

## Appendix
- Palette reference: Deep Navy (#1D2A4D), Electric Teal (#00CABA), Cool Gray (#F5F7FA), Charcoal Gray (#3A3A3A), White (#FFFFFF).
- Typography reference: Montserrat (headline, uppercase for short headings), Lato (body).
