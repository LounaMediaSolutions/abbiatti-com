[
  {
    "file": "src/pages/Tasks.tsx",
    "line": 288,
    "summary": "Assignee dropdown now filters members to staff-only roles, but existing tasks assigned to a cohost or admin will silently drop their assignee label since `members.find(...)` returns undefined for them.",
    "failure_scenario": "Admin previously assigned a deep-clean task to a cohost. After this diff, that cohost is no longer fetched into `members`, so on the task card the `{assignee && <p>👤 ...</p>}` line (Tasks.tsx:694, 896) never renders — the task card shows no assignee at all, and the same task can no longer be reassigned to another cohost/admin from the New-task dialog."
  },
  {
    "file": "src/pages/Settings.tsx",
    "line": 108,
    "summary": "OrgTab / TemplatesTab / PartnersTab / AlbumsTab are now keyed off `pending_org_id` when `org_id` is null, which assumes pending-invite users have RLS read access to the target org's organizations/message_templates/partners/albums tables.",
    "failure_scenario": "User accepts invite but membership row hasn't been promoted yet (only `pending_org_id` is set). Settings renders Templates/Partners/Albums tabs that query the pending org — if RLS scopes those tables to confirmed members, the queries return empty and the user sees apparently-deleted templates/partners/albums; worse, AlbumsTab/PartnersTab write paths may 403 silently when the user clicks Save."
  },
  {
    "file": "src/pages/Settings.tsx",
    "line": 296,
    "summary": "`AvatarUpload` is passed an `organizationId` prop that its `Props` interface does not declare (AvatarUpload.tsx:8-14) — the prop has been dead since this component was written, and gating avatar upload behind `effectiveOrgId` therefore hides upload from users who legitimately could use it.",
    "failure_scenario": "Super-admin with no org sees no avatar upload UI at all (the `{effectiveOrgId && <AvatarUpload .../>}` guard hides it). The actual upload path is `users/${userId}.${ext}` — fully user-scoped, no org needed — so the guard is gating on a value the component never reads."
  },
  {
    "file": "src/pages/Reservations.tsx",
    "line": 18,
    "summary": "`getInitials` returns `\"?\"` only when the input is falsy; whitespace-only names (`\"   \"`) skip the guard, then `.trim().split(/\\s+/)` yields `[\"\"]` so the function returns an empty string and renders an empty avatar pill.",
    "failure_scenario": "An iCal sync writes a guest with name `\" \"` (sources sometimes import a single space). The reservation card renders a 44×44 ring-1 pill with no glyph inside instead of the intended `?` placeholder."
  },
  {
    "file": "src/components/AppLayout.tsx",
    "line": 228,
    "summary": "Active sidebar items are now hard-coded to `text-white` and inactive items to `text-sidebar-foreground/70`, dropping the `sidebar-primary-foreground` token — this couples the look to a dark sidebar and breaks if the sidebar palette is ever themed lighter (the existing `--sidebar-primary-foreground` token exists precisely to decouple this).",
    "failure_scenario": "User switches to a light/sand sidebar theme (or RTL Arabic build with adjusted tokens); active items render white-on-light with WCAG-failing contrast. The previous token-driven version adapted automatically."
  },
  {
    "file": "src/index.css",
    "line": 3,
    "summary": "Google Fonts is loaded via top-level `@import url(...)` — a render-blocking, network-dependent CSS import that adds a hop on every cold load and fails closed when fonts.googleapis.com is blocked (corporate networks, CN region).",
    "failure_scenario": "User on a network that blocks Google Fonts (common in CN/regulated environments): the @import stalls until timeout, delaying the first paint of every page; once it fails, h1 falls back to Georgia/Times rather than the Inter system stack the body uses — visually inconsistent."
  },
  {
    "file": "src/pages/Reservations.tsx",
    "line": 506,
    "summary": "`nights = Math.max(0, differenceInCalendarDays(...))` then renders only when `nights > 0`, hiding the Moon row entirely for same-day (0-night) bookings — which are real for day-use/early-checkout listings.",
    "failure_scenario": "A guest books a day-use stay (check_in and check_out on the same calendar date). The reservation card now omits the night-count entirely instead of showing `0`, making it look indistinguishable from a single-night booking when scanned next to a row with the icon hidden by `Math.max` for ordinary stays."
  }
]