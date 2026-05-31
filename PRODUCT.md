# Product

## Register

product

## Users

Three operational roles inside a vacation-rental management organization:

- **Admins** (org owners / managers): run the whole property portfolio. Live in the dashboard daily, scoped to their org's properties, reservations, team, and finances.
- **Cohosts**: manage a subset of properties assigned to them. Need a focused view of just their properties and their bookings — never the full org.
- **Employees** (cleaner / driver / decorator / maintenance / staff): on-site, on a phone, between tasks. Need big buttons, photo upload, voice notes. Don't read dense tables.

Plus a **super-admin** tier for platform operators.

Context of use: mostly desktop for admin/cohost roles in an office or at home. Mobile-first for employee roles in the field. Often used alongside WhatsApp and phone calls; the app is the system of record, not the primary communication channel.

## Product Purpose

Escapar is the back-of-house operating system for vacation-rental businesses — properties, reservations, tasks, team coordination, finance. It exists to remove the spreadsheet/WhatsApp chaos that property managers default to, and replace it with a calm, role-scoped workspace where each person sees exactly the data they own. Success looks like: a cohost trusts the dashboard enough to stop maintaining their own Google Sheet, and a cleaner finishes a turn-over from their phone without anyone calling them.

## Brand Personality

Editorial, calm, premium.

Voice: confident, restrained, specific. Talks like a senior operator, not a SaaS landing page. Verbs over adjectives. Numbers over modifiers. The interface should feel like a well-designed magazine spread that happens to be a tool: serif headings carry the brand, body type works hard.

Emotional goal: the operator feels in control. Not impressed, not delighted, not entertained — in control. The interface earns trust by being readable, predictable, and unhurried.

## Anti-references

- **Airbnb / Booking.com consumer style.** Photo-forward marketplace UI, search-first hero, big CTA stacks. We are the back-of-house tool, not the consumer side. Property images appear inside tables and detail views, never as the page's identity.
- **Generic B2B SaaS scaffolding.** No hero-metric template (giant number / small label / gradient accent / repeating cards). No identical icon-+-heading-+-text card grids.
- **Heavy-enterprise PMS category defaults.** Cloudbeds / Guesty-style dense gray-on-gray tables, dropdown-stacked toolbars, zero typographic personality. The category cliché.
- **The 2026 AI-template tells.** Tiny tracked uppercase eyebrows above every section. Numbered `01 / 02 / 03` section markers. Gradient text. Side-stripe colored borders on cards. Cream/sand body bg as the warm-default reflex (we use sand intentionally, anchored to a committed brand palette, not as scaffolding).

## Design Principles

1. **Role is the lens.** Every screen shows exactly what this role owns and nothing else. A cohost never sees the full org; an employee never sees a dashboard. Scope is the design, not the filter.
2. **Editorial restraint, operator density.** Hierarchy through typography and spacing, not through borders, cards, and color. Numbers and dates should read like a printed report. Density is fine when the role needs it (admin tables); whitespace earns its place (employee screens).
3. **Calm in motion.** Transitions are functional: tell me state changed, then get out of the way. No bounce, no elastic, no decorative reveals. Reduced motion is a first-class path, not a fallback.
4. **The app is bilingual and the layout knows it.** Arabic (RTL) is a native flow, not a mirror trick. Spacing, alignment, typography, and motion all have to read right when the page flips. Test RTL alongside LTR, not after.
5. **Trust before delight.** Every interactive element has its loading, error, and empty state. The dashboard never shows a blank where data should be without saying why. Reliability is the brand.

## Accessibility & Inclusion

- **WCAG 2.1 AA baseline.** Body text ≥ 4.5:1 against background; large text ≥ 3:1. Focus indicators visible against every surface (including the dark sidebar). No keyboard traps in modals or drawers.
- **Reduced motion is required.** Every animation has a `prefers-reduced-motion: reduce` alternative (crossfade or instant). Decorative motion is suppressed entirely under reduced motion.
- **RTL polish is non-negotiable.** Arabic users get a layout that feels designed, not flipped: directional icons mirror, scroll/swipe affordances flip, line-height and tracking are tuned for Arabic shaping, serif Latin display faces fall back to sans for Arabic strings.
- **Touch targets ≥ 44×44 on employee surfaces.** Field workers on phones cannot miss-tap a 32px button between cleanings.
- **Color is never the only signal.** Status (success / warning / destructive) always pairs with a label, icon, or position — never just the chip's hue.
