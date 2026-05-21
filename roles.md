# ESCAPAR — Role Documentation

This document is the **deep reference for every user role** in the ESCAPAR vacation-rental management platform: what each role can **view**, what they can **access** (routes / sidebar), and what they can **do** (CRUD operations and concrete actions).

It reflects the behaviour implemented in the codebase today, not aspirational features. For wider project context — tech stack, routing map, database schema, RLS model — see `documentation.md` in the same folder.

---

## Implementation status — short answer

**The website is NOT fully working as described below.** The UI is built around a permission model that assumes a number of database tables which do not exist in the live Supabase deployment. The auto-generated `src/integrations/supabase/types.ts` (the source of truth for what's in production) only contains 12 tables: `audit_log`, `booking_channels`, `bookings`, `invoices`, `organizations`, `profiles`, `properties`, `property_cohosts`, `rental_items`, `services`, `subscriptions`, `tasks`, plus 2 views.

Every feature in this document that touches a different table is currently broken or empty. Status markers are used throughout:

- **[OK]** — implemented and working.
- **[BROKEN]** — referenced in code but the underlying table is missing in the live DB; queries return errors or empty results.
- **[STUB]** — partially implemented; UI exists but the real integration is not wired.
- **[MISMATCH]** — code expects different column names than the live schema has; bindings render as `undefined`.

The single biggest issue is **role routing itself**: `ProtectedRoute` only checks that the user is logged in — it does not check the role. Real enforcement today is:

1. The sidebar in `AppLayout` renders different nav items per role.
2. `Home.tsx` dispatches `/`, `/admin/dashboard`, `/cohost/dashboard`, `/employee` to the correct dashboard.
3. Only `/super-admin/*` and `/anomalies` re-check the role server-side.
4. Supabase RLS filters the data.

A logged-in user who types a URL for a page they shouldn't see will still render that page; only RLS prevents data leaks.

### Cross-cutting features that are NOT implemented

- **Marketplace** — listed on the roadmap but no routes or tables exist for it.
- **WhatsApp Cloud API** — every "send WhatsApp" feature builds `wa.me/` deeplinks only. No server-side sending. **[STUB]**
- **Real role enforcement at the route level** — `ProtectedRoute` does not check roles (see above). **[STUB]**
- **Dual role sources of truth** — most code reads `profiles.role`. `GuestPortal` was patched in May 2026 to drop its `user_roles` dependency; `Team`, `GuestBooks`, and `isSuperAdminUser` still consult the missing `user_roles` table. **[PARTIAL]**
- **Schema-fallback hack in Tasks insert** — `insertTaskWithSchemaFallback` iterates across alternative column names (`created_by` / `assigned_by`, `task_type` / `type`, `scheduled_date` / `due_at`, `org_id` / `organization_id`) because the deployed schema diverges from migrations. **[MISMATCH]**

### Tables the code references but the live DB does NOT have

`ad_banners`, `ad_impressions`, `booking_requests`, `coupon_redemptions`, `guest_albums`, `inventory_items`, `inventory_movements`, `message_templates`, `notifications`, `partner_coupons`, `partner_services`, `property_approval_events`, `public_properties`, `reservation_rentals`, `reservations`, `user_roles`.

**Provisioned May 2026 hotfix:** `property_members` — generic property↔profile assignment table (id, organization_id, property_id, user_id, role, created_at) added via migration `20260517130000`. Complements `property_cohosts` (cohost-specific, carries `permissions[]`). Used by Properties.tsx assign-to-property dialog, Team.tsx staff assignments, and CohostDetail.tsx. Admin-only writes; org-wide reads.

**Recently added (Task Ops Pack, May 2026):** `task_photos`, `cleaning_checklists`, `maintenance_tickets` are now provisioned via migrations `20260517100000`–`20260517100300`, plus storage buckets `task-photos` (private) and `maintenance-photos` (public). The features that depend on these tables — task photo proof, cleaning checklists, maintenance tickets queue, "report a problem" from the employee agenda — now work end-to-end.

**Recently added (Guest Portal Foundation, May 2026):** `guest_accounts`, `guest_books`, `guest_messages`, `guest_uploads` are now provisioned via migrations `20260517110000`–`20260517110300`, plus the `guest-uploads` storage bucket and the `get_public_guest_book(_slug)` RPC for anon access. `GuestPortal.tsx` no longer depends on the missing `user_roles` table — it reads `profiles.role` per the project rule. Authenticated guest portal, public welcome book at `/g/:slug`, host↔guest messaging, and guest photo feed now work end-to-end. Partner services / coupons / ad banners on the same page still degrade to empty state until those tables ship.

**Recently added (iCal Auto-Sync, May 2026):** `property_ical_feeds` is now provisioned via migration `20260517120000`, plus a unique index on `bookings (property_id, channel_slug, channel_ref)` to support upserts. The companion `supabase/functions/sync-ical` Edge Function fetches each feed, parses VEVENT blocks with line-folding per RFC 5545, and upserts stays into `bookings` with `channel_slug` = source (airbnb / booking / vrbo / expedia / manual) and `channel_ref` = VEVENT.UID. Owner-blocks (Airbnb "Not available") import as `bookings.status = 'blocked'`. The `IcalManager` dialog wires the "Sync now" button to the function via `supabase.functions.invoke("sync-ical", { body: { feed_id } })`. Scheduled batch sync can be configured via pg_cron — see the comment at the top of `index.ts` for the recommended `cron.schedule` invocation.

This list is the root cause of nearly every **[BROKEN]** marker below.

---

## Roles at a glance

| Role | Internal value(s) | Landing route | Sidebar |
|---|---|---|---|
| Super-admin | `super_admin` | `/super-admin` | Super-admin nav |
| Admin | `admin` | `/admin/dashboard` | Manager nav |
| Co-admin | `co_admin` | `/admin/dashboard` | Manager nav |
| Co-host | `cohost` (or any role with rows in `property_cohosts`) | `/cohost/dashboard` | Cohost nav |
| Employee | `cleaner`, `driver`, `decorator`, `maintenance`, `staff` | `/employee` (renders `MyAgenda`) | Staff nav |
| Guest | `guest` | `/guest` | none (full-screen portal) |

Role groupings used in code (`src/lib/access.ts`):

- `ADMIN_ROLES` → `super_admin`, `admin`, `co_admin`
- `ORG_ADMIN_ROLES` → `admin`, `co_admin`
- `EMPLOYEE_ROLES` → `cleaner`, `driver`, `decorator`, `maintenance`, `staff`

The role is read from `profiles.role` on every page that needs it (per the project rule that role must never be trusted from client state). A second `user_roles` table is consulted in a handful of places (`GuestPortal`, `Team`, `GuestBooks`, `isSuperAdminUser`) which creates a dual source of truth — this is one of the known cleanup items.

---

## Important caveat about enforcement

Role enforcement is currently split between two mechanisms:

1. **`ProtectedRoute` only verifies the user is logged in** — it does NOT check the role. Role-shaped access is achieved via (a) the sidebar in `AppLayout` which renders a different nav per role, (b) `Home.tsx` redirecting `/`, `/admin/dashboard`, `/cohost/dashboard`, and `/employee` to the correct dashboard, and (c) Supabase RLS policies filtering the data.
2. **Only `/super-admin/*` and `/anomalies` re-check the role on the page itself.**

A direct URL to (for example) `/properties` will render the page for any logged-in user; what they actually see depends on row-level-security on the underlying tables. The CLAUDE.md notes role routing is broken and needs a clean rewrite — this document describes the *intended* permission model that the UI is built around.

---

## 1. Super-admin (`role = 'super_admin'`)

The platform operator. One per ESCAPAR deployment, not per agency. Unrestricted cross-organisation access.

### Routes / sidebar

Super-admin nav: **Organisations · Profils · Properties · Availability · Reservations · Tasks · Reports · Settings.** Plus the entire admin sidebar — super-admins inherit manager pages.

Super-admin-only routes:

- `/super-admin` — list of every organisation on the platform
- `/super-admin/orgs/:id` — single-org deep dive
- `/super-admin/billing` — per-org pricing and invoices
- `/super-admin/profiles` — every profile across every org
- `/super-admin/staff` — internal platform staff (technician, developer, accountant, support, super_admin)

These five pages are the only ones with a server-checked role guard (`isSuperAdminUser()` falling back to a `user_roles` query). Everything else renders `<Unauthorized />` for non-super-admins.

### What they can view

- Every `organizations` row with status (active / suspended), trial expiry, plan limits (max cohosts, max employees), and per-org stat cards (total orgs, active, suspended).
- For any single org: counts of admins, cohosts, employees, properties; pending invitations; pricing configuration; full invoice history.
- Every profile across every org with role and org assignment.
- Internal platform-staff list (technicians, developers, accountants, support, other super-admins).

### What they can do

- **Create a new agency** — inserts an `organizations` row. **[OK]**
- **Invite an admin** to any org via the `create-team-member` edge function. **[OK]** (edge function deployment assumed)
- **Extend trials** — `+7 days` or `+30 days` buttons that update `trial_ends_at`. **[OK]**
- **Edit any org** — name, brand colour, `max_cohosts`, `max_employees`, `trial_ends_at`. **[MISMATCH]** The code's in-file `Org` type uses `brand_color`, `max_cohosts`, and `suspended`, but the live `organizations` table has `primary_color` / `secondary_color`, `max_employees` / `max_properties` (no `max_cohosts`), and `active` (no `suspended`). Those fields render as `undefined` until `SuperAdmin.tsx` is updated.
- **Suspend / reactivate** any org. **[MISMATCH]** — toggles a `suspended` flag that doesn't exist; live schema uses `active`.
- **Delete** an org (with confirmation dialog). **[OK]**
- **Cancel pending invitations** — sets `profiles.invitation_status` back to null. **[OK]** (assumes the `invitation_status`, `pending_org_id`, `pending_role`, `invited_by` columns added in migration `20260516120000` are deployed; verify against the running DB).
- **Configure pricing per org** — base monthly fee, per-admin / cohost / employee seat price, per-message price, per-iCal-sync price, per-MB storage price, currency. **[BROKEN]** The `price_monthly_base`, `price_per_admin`, `price_per_cohost`, `price_per_employee`, `price_per_message`, `price_per_ical_sync`, `price_per_mb_storage`, `billing_currency` columns do not exist on the live `organizations` table. The pricing page will fail to save.
- **Generate invoices** — runs `computeUsageForOrg` and inserts an `invoices` row; can then download PDF, mark sent, mark paid, or delete. **[OK]** for CRUD on `invoices`, but **[BROKEN]** for usage computation since usage relies on `subscriptions` plus the missing pricing columns above.
- **Assign roles** to any profile on the platform (any role, including super_admin). **[OK]** at the `profiles.role` level. **[BROKEN]** for any code path that also writes to `user_roles` (table doesn't exist).
- **Create internal platform staff** (technician, developer, accountant, support, super_admin) via the same edge function. **[OK]** (assuming edge function is deployed)
- Everything an admin can do, scoped to any org they choose. (Inherits all the admin **[BROKEN]** markers below.)

### What they cannot do

No functional restrictions in code for super-admin. RLS policies generally bypass tenant matching via `is_super_admin()`.

---

## 2. Admin and Co-admin (`role = 'admin' | 'co_admin'`)

The agency owner or senior manager. Sees everything inside their own organisation and nothing outside it. `admin` and `co_admin` are nearly identical; the only difference is what they can invite (see below).

### Routes / sidebar

Manager sidebar: **Dashboard · Properties · Availability · Reservations · Tasks · Reports · Team · Settings.**

Additional routes reachable by direct URL or contextual links:

- `/inventory` — per-property stock management
- `/rentals` — rental items catalogue
- `/guest-books` — guest welcome books
- `/tickets` — maintenance tickets queue
- `/anomalies` — admin-only operational anomalies dashboard
- `/showcase` — booking-request inbox from the public showcase site
- `/invoices` — read-only view of their own org's invoices (paid to the platform)
- `/cohosts/:id` — per-cohost KPI deep-dive

Cannot access `/super-admin/*` — those routes render `<Unauthorized />`.

### What they can view

- **Dashboard** — three KPI cards scoped to their org: total properties, total team members, total tasks. **[OK]** Plus a `WhatsAppReminders` panel that builds `wa.me` deeplinks. **[STUB — no real WhatsApp API]**
- **Properties** — every property in their org with all private fields (`access_code`, `entry_instructions`, etc.), generated QR code. **[OK]** Approval timeline. **[BROKEN — `property_approval_events` table missing]** iCal sources. **[OK]** (May 2026)
- **Availability** — calendar grid across all properties showing reservations. **[OK]** (uses `bookings`)
- **Reservations** — full reservation list, filter and search. **[OK]** (live table is `bookings`; legacy code paths that still query `reservations` are **[BROKEN]**). iCal feed manager. **[OK]** (May 2026 — see Task Ops iCal section above). WhatsApp template message composer. **[STUB — deeplinks only]** Guest-account creation dialog. **[OK]** (May 2026)
- **Tasks** — every task in the org regardless of assignee. **[OK]**
- **Reports** — generate PDF reservation reports filterable by year, month, and property. **[OK]** (uses `bookings` + jsPDF)
- **Team** — every team member in the org (admins, cohosts, employees), with role and assignment info, plus inline cohost KPIs. **[OK]** for the profiles/property_cohosts read. Any code path that also reads `user_roles` is **[BROKEN]**.
- **Tickets** — every maintenance ticket for the org, filterable by status. **[OK]** (provisioned May 2026)
- **Anomalies** — operational health view: overdue tasks, open tickets, unanswered guest messages, missed cleanings, reservation conflicts. **[PARTIAL]** Overdue-tasks, open-tickets, and missed-cleanings queries now work (May 2026). Unanswered guest messages and reservation conflicts still depend on missing tables (`guest_messages`, `reservations`).
- **Invoices** — invoices owed by their org to the platform (read-only, downloadable as PDF). **[OK]**

### What they can do

- **Properties** — full create / read / update / delete on `properties`. **[OK]** Manage iCal subscriptions. **[OK]** (May 2026) Approve or reject property submissions. **[BROKEN — `property_approval_events` missing]**
- **Reservations** — full CRUD on `bookings`. **[OK]** (anything in the code that still calls `.from("reservations")` is **[BROKEN]**). Generate guest accounts. **[OK]** (May 2026) Send WhatsApp templates. **[STUB — deeplinks only]**
- **Tasks** — create, edit, delete, assign, and re-assign tasks. **[OK]** but uses the `insertTaskWithSchemaFallback` hack because the live `tasks` schema diverges from migrations. **[MISMATCH]** Upload task photos to storage. **[OK]** Uses the `task-photos` bucket and the `task_photos` metadata table (provisioned May 2026). Use the cleaning checklist. **[OK]** Backed by `cleaning_checklists` table (provisioned May 2026). Mark tasks across any status. **[OK]**
- **Team** — invite new members via the `create-team-member` edge function. **[OK]** Editable roles depend on whether you are admin or co-admin:
  - **Admins** can invite: co_admin, cohost, cleaner, driver, decorator, maintenance. **[OK]**
  - **Co-admins** can invite: cohost and employee roles only — *not* other co-admins or admins. **[OK]**
  - Admins can promote or demote members within their tier; co-admins cannot edit other co-admins. **[OK]**
- **Inventory** — CRUD on per-property items (linen, cleaning, consumable, equipment, other) with low-stock thresholds. **[BROKEN — `inventory_items` and `inventory_movements` tables missing]**
- **Rentals** — CRUD on `rental_items` (baby / beach / tech / mobility / outdoor / service categories), with seeded defaults. **[OK]**
- **Guest books** — CRUD, generate slugs and QR codes. **[BROKEN — `guest_books`, `guest_albums` tables missing]**
- **Tickets** — update status across the lifecycle (new → in_progress → resolved → closed). **[OK]** (provisioned May 2026)
- **Booking requests** — process incoming requests from the public `/v/:orgId` showcase. **[BROKEN — `booking_requests` table missing]**
- **Reports** — generate PDFs via jsPDF. **[OK]**
- **Settings** — edit own profile, org settings, partner integrations, photo albums. **[PARTIAL]** Profile and org branding work; partner integrations and album tabs likely **[BROKEN]** (`partner_services`, `guest_albums` missing).

### What they cannot do

- Cannot access any `/super-admin/*` route.
- Cannot edit the super_admin role on any profile.
- Cannot see other organisations' data — every admin query is filtered by `org_id` and backed by RLS.
- Co-admins specifically cannot invite other co-admins or admins, and cannot demote an admin.
- WhatsApp messages are not actually sent — the UI generates `wa.me` links only.
- No real marketplace — the showcase page exists but the wider marketplace feature is missing per CLAUDE.md.

---

## 3. Co-host (`role = 'cohost'`, or any profile with `property_cohosts` rows)

A property manager assigned to a subset of an organisation's properties via the `property_cohosts` table. Sees only the properties they have been linked to, and the data attached to those properties.

### Routes / sidebar

Cohost sidebar: **Dashboard · Properties · Availability · Reservations · Tasks · Team · Rentals · Livrets (guest books) · Signalements (tickets).**

Notably **missing** from the cohost sidebar (compared to admin): Reports, Settings, Anomalies, Inventory.

### Permission model

Each `property_cohosts` row carries a `permissions text[]` column. The tokens currently in use are:

- `manage_properties`
- `manage_reservations`
- `manage_tasks`
- `manage_staff`
- `view_financials`
- `manage_settings`

A cohost only gets the actions explicitly granted on each property. Admins have all permissions by default. Helpers in `access.ts`: `getPropertyPermissions(userId, propertyId)` and `hasPropertyPermission(userId, propertyId, permission)`.

### What they can view

- **Dashboard** — KPI cards scoped to *their* assigned properties only: number of assigned properties, total tasks across those properties, and team members (distinct users in `property_cohosts` for the same properties). **[OK]**
- **Properties** — only the properties they are linked to via `property_cohosts`. Uses the "without-private-fields" select. **[OK]**
- **Reservations** — only reservations whose `property_id` is in their assignment list. **[OK]** (against `bookings`)
- **Availability** — calendar limited to their properties. **[OK]**
- **Tasks** — tasks attached to their properties. **[OK]**
- **Team** — visibility into co-hosts and employees who share their properties. **[OK]**
- **Rentals** — for their properties only. **[OK]**
- **Livrets** (guest books). **[BROKEN — `guest_books` table missing]**
- **Signalements** (tickets). **[OK]** (provisioned May 2026)

### What they can do

Subject to the per-property `permissions[]`:

- View and update property details. **[OK]**
- View, create, update, and cancel reservations. **[OK]** (against `bookings`)
- View, create, assign, and update tasks. **[OK]** (same `insertTaskWithSchemaFallback` **[MISMATCH]** as admin)
- View and update guest books for their properties. **[BROKEN — `guest_books` missing]**
- Update maintenance tickets attached to their properties. **[OK]** (provisioned May 2026)
- View KPIs for their own performance (`/cohosts/:id`). **[OK]**

### What they cannot do

- Cannot access `/super-admin/*` or `/anomalies` (admin-only).
- No Reports, Settings, or Inventory pages in their sidebar.
- Cannot manage org-wide team roles — `Team.tsx` does not give cohosts any editable roles. Cohosts can view but not promote or demote others.
- Cannot see other cohosts' properties or any property they are not linked to.
- Cannot access financial data unless their `permissions` array includes `view_financials`.
- Cannot extend trials, edit org settings, configure pricing, or manage invoices.

---

## 4. Employee — cleaner / driver / decorator / maintenance / staff

Field workers. All five employee roles share the **exact same UI** — the role name is used to categorise team members and to filter task assignments, not to gate features.

### Routes / sidebar

Staff sidebar: **Mon agenda · Signalements · Help · Settings.** That's the entire surface area.

`/employee` (and `/`) redirects to `MyAgenda` automatically.

### What they can view

- **My Agenda** (`MyAgenda.tsx`) — the only operational page they have. It queries `tasks` filtered by `assigned_to = user.id` and `status != 'done'`, ordered by `due_at`. Tasks are grouped by Today / Tomorrow / future / undated, each with a type icon. The property name is hydrated from `properties` for tasks that have a `property_id`. **[OK]** — this is the most stable surface of the app per `documentation.md` §8.
- **Signalements** (Tickets) — can navigate to `/tickets` but only data their RLS lets them see. **[OK]** (provisioned May 2026)
- **Settings** — their own profile. **[OK]**
- **Help** — static help page. **[OK]**

The UI is intentionally simple per CLAUDE.md: big buttons, photo uploads, voice recording. No dense tables.

### What they can do

- **Start a task** — updates the task to `in_progress`, sets `started_at`. **[OK]**
- **Complete a task** — updates the task to `done`, sets `completed_at`. **[OK]**
- **QR check-in** — scan a property's QR code (`QRCheckInScanner`) for tasks in `todo` status that have a `property_id`. **[OK]** (the scanner is client-side)
- **Upload photos** for tasks (mobile-friendly upload to `task_photos` storage). **[OK]** (provisioned May 2026) The MyAgenda task card now has a Photo button; tap → file picker → uploads to the `task-photos` bucket → metadata row in `task_photos`.
- **Report a problem** on the active task — opens a dialog (title + description) and creates a `maintenance_tickets` row linked to the task. **[OK]** (provisioned May 2026)
- **Open the cleaning checklist** for cleaning-type tasks — auto-seeds 10 default French items on first open; tick each as done. **[OK]** (provisioned May 2026)
- **Update their own profile.** **[OK]**

### What they cannot do

- Cannot create or assign tasks — only managers can.
- Cannot see other employees' tasks.
- Cannot view properties, reservations, the team list, reports, inventory, anomalies, or any admin/cohost page — they don't appear in the sidebar, and RLS should empty those tables if the URL is hit directly.
- Cannot change task status arbitrarily — only the `todo → in_progress → done` flow is exposed.
- Cannot manage anyone else — no Team page.

---

## 5. Guest (`role = 'guest'`)

End-customers staying at a property. Authenticated separately and routed to a dedicated portal that never shows the standard app sidebar.

> **Section-level status:** **[PARTIALLY WORKING]** (May 2026 update). The core guest portal flow — sign-in, property info, welcome book, messaging, photo feed — works now that `guest_accounts`, `guest_books`, `guest_messages`, and `guest_uploads` are provisioned. Partner services / coupons / ad banners on the same page still degrade gracefully to empty state because `partner_services`, `partner_coupons`, `coupon_redemptions`, and `ad_banners` are not yet provisioned. Public welcome book at `/g/:slug` renders via the `get_public_guest_book` RPC.

### Routes

- `/guest` — the guest portal (their stay). **[OK]** Reads `profiles.role` (no longer the missing `user_roles`); loads guest_accounts, guest_books, guest_messages, guest_uploads, rental_items. Partner_services + AdBanner + GuestCoupons soft-fail until those tables ship.
- `/guest-preview/:reservationId` — same portal but in preview mode for staff QA (admin / cohost only). **[PARTIAL]** GuestPortal was patched to try `bookings` first (the live table), falling back to `reservations` only if present. Works for bookings; full preview parity needs the booking row to carry the same fields the legacy `reservations` table exposed (`guest_phone`, `guest_language`, etc.).
- Public, unauthenticated routes accessible to anyone:
  - `/g/:slug` — printable guest book. **[OK]** Rendered via the `get_public_guest_book` SECURITY DEFINER RPC (anon-callable).
  - `/s/:slug` — public reservation page. **[BROKEN — `reservations` table missing]**
  - `/r/:slug` — issue-reporting form. **[OK]** (maintenance_tickets provisioned May 2026)
  - `/v/:orgId` — agency public showcase. **[BROKEN — `public_properties` table missing]**
  - `/redeem/:code` — coupon redemption. **[BROKEN — `partner_coupons`, `coupon_redemptions` tables missing]**

If a logged-in user has `profiles.role = 'guest'`, `AppLayout` immediately redirects them to `/guest` with `replace: true`. They never see the main sidebar. **[OK]** (the redirect itself works)

### What they can view

The portal (`GuestPortal.tsx`) checks the guest role via `profiles.role` (May 2026 patch — no longer reads the missing `user_roles` table), then loads:

- Their `guest_accounts` record (linked to a property and a reservation). **[OK]**
- The property details. **[OK]** (uses `properties`)
- The active `guest_books` entry for the property. **[OK]**
- Partner services (`partner_services` filtered to `active=true` and `visible_to_guest=true`, sorted gold → silver → standard). **[BROKEN — degrades to empty]**
- Rental items (`rental_items` filtered to `active=true`). **[OK]** (live schema uses `org_id`, code patched accordingly)
- Their own messages thread with the host. **[OK]**
- Their own photo uploads. **[OK]**
- Coupons they hold (`GuestCoupons` component). **[BROKEN — `partner_coupons` missing; component renders empty]**
- An `AdBanner` placement. **[BROKEN — `ad_banners`, `ad_impressions` missing; component renders null]**

Typical tabs surface: Wi-Fi, key access, messages, photos (camera), partners, rentals, coupons.

### What they can do

- **Post messages** to the host (insert into the messages table). **[OK]** (May 2026)
- **Upload photos** with comments. **[OK]** (May 2026) Uses `guest-uploads` storage bucket + `guest_uploads` metadata table.
- **Browse partner services** offered for their property. **[BROKEN — `partner_services` missing]**
- **Browse rental items** they can request. **[OK]**
- **Redeem coupons** they hold. **[BROKEN — `partner_coupons`, `coupon_redemptions` missing]**
- **Toggle marketing consent.** **[OK]** (May 2026)
- **Sign out.** **[OK]**

### What they cannot do

- Cannot see any property or reservation other than their own.
- Cannot view tasks, the team, or operational data.
- Cannot access the main app sidebar or any admin / cohost / employee page — they are auto-redirected to `/guest` on every navigation.

---

## Capability matrix — quick lookup

| Capability | Super-admin | Admin | Co-admin | Co-host | Employee | Guest |
|---|---|---|---|---|---|---|
| Manage organisations (CRUD) | yes | no | no | no | no | no |
| Configure org pricing & invoices | yes | no | no | no | no | no |
| Suspend / reactivate orgs | yes | no | no | no | no | no |
| Invite admins | yes | yes | no | no | no | no |
| Invite cohosts | yes | yes | yes | no | no | no |
| Invite employees | yes | yes | yes | no | no | no |
| CRUD properties | yes | yes (own org) | yes (own org) | yes (assigned + permitted) | no | no |
| CRUD reservations / bookings | yes | yes (own org) | yes (own org) | yes (assigned) | no | no |
| CRUD tasks | yes | yes (own org) | yes (own org) | yes (assigned) | update own only | no |
| Generate PDF reports | yes | yes | yes | no | no | no |
| View anomalies dashboard | yes | yes | yes | no | no | no |
| Manage inventory | yes | yes | yes | no | no | no |
| Manage guest books | yes | yes | yes | yes (assigned) | no | no |
| View own agenda | n/a | n/a | n/a | n/a | yes | n/a |
| Use guest portal | no | preview only | preview only | no | no | yes |

---

## Known gaps and stubs

These are called out so the documentation does not over-promise — they match the "Broken/missing" section in CLAUDE.md.

- **Role routing is broken at the route level.** `ProtectedRoute` does not enforce role. Only `/super-admin/*` and `/anomalies` re-check the role on the page itself. Access for other roles relies on a combination of sidebar layout and Supabase RLS — this is the project's known cleanup item.
- **Marketplace is not implemented.** The public showcase (`/v/:orgId`) and `BookingRequests` page exist; the wider marketplace feature does not.
- **WhatsApp API is not connected.** The UI generates `wa.me/` deeplinks; no messages are sent server-side.
- **Dual role sources.** Most code reads `profiles.role`; a few pages (`GuestPortal`, `Team`, `GuestBooks`, `isSuperAdminUser`) also consult `user_roles`. These need to be reconciled.
- **Tasks insert uses a schema-fallback hack** (`insertTaskWithSchemaFallback`) iterating across alternative column names (`created_by` / `assigned_by`, `type` / `task_type`, `due_at` / `scheduled_date`, `organization_id` / `org_id`) — indicates the deployed schema diverges from migrations.
