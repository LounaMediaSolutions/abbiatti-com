# Escapar — Complete Documentation

> A plain-English, in-depth guide to what this app is, who uses it, how it works, and how it is built.
> Written so a non-technical reader can follow the first half, and a developer can rely on the second half.
>
> *This file reflects the application **as actually built** (verified against the current code, migrations, and Edge Functions). If something here disagrees with older notes, trust this file.*

---

## Table of Contents

1. [What is this app?](#1-what-is-this-app)
2. [Who uses it (the roles)](#2-who-uses-it-the-roles)
3. [What you can do with it (features)](#3-what-you-can-do-with-it-features)
4. [How it is built (technology)](#4-how-it-is-built-technology)
5. [How the pieces fit together (architecture)](#5-how-the-pieces-fit-together-architecture)
6. [The data model (what is stored)](#6-the-data-model-what-is-stored)
7. [Roles and permissions in depth](#7-roles-and-permissions-in-depth)
8. [Signing in (authentication)](#8-signing-in-authentication)
9. [The QR sign-in system explained](#9-the-qr-sign-in-system-explained)
10. [Server functions (Edge Functions)](#10-server-functions-edge-functions)
11. [Page-by-page guide](#11-page-by-page-guide)
12. [How data is kept safe (security model)](#12-how-data-is-kept-safe-security-model)
13. [Languages and right-to-left support](#13-languages-and-right-to-left-support)
14. [Developer guide](#14-developer-guide)
15. [Deployment](#15-deployment)
16. [What is not built yet](#16-what-is-not-built-yet)
17. [Glossary](#17-glossary)

---

## 1. What is this app?

**Escapar** is a web application for **managing vacation-rental properties** — the kind of short-stay homes and apartments you would find on Airbnb or Booking.com.

It is the **back-office tool** for the people who *run* those rentals, not the website where guests *book* them. Think of it as the control room: it keeps track of properties, bookings, cleaning and maintenance jobs, the team doing the work, and the guests staying over.

A few important ideas in plain terms:

- **Multi-tenant** — one app serves many separate rental businesses ("organizations"). Each business only ever sees its own data.
- **White-label** — each organization can show its own logo and brand color, so the app can look like *their* product. (This deployment is branded **Abbiatti**; "Escapar" is the underlying platform.)
- **Role-based** — what you see depends on who you are. An owner sees everything in their business; a cleaner sees only their tasks.
- **Single-page web app** — it runs in the browser, feels like an app, and works on phones and desktops.

> **One-line summary:** Escapar replaces the messy spreadsheets-and-WhatsApp way of running rental properties with one calm, organized workspace where every person sees exactly what they need.

---

## 2. Who uses it (the roles)

The app has several types of users. Each one is called a **role**. Your role decides which pages and data you can reach.

| Role | Who they are | What they see |
|---|---|---|
| **Super-admin** | The platform operator (the company running Escapar itself) | Everything, across every organization |
| **Admin** | The owner or manager of a rental business | Everything inside their own organization |
| **Co-admin** | A second manager with the same powers as an admin | Everything inside their own organization |
| **Cohost** | A partner who manages a *subset* of properties | Only the properties assigned to them |
| **Employee** | Field staff: **cleaner, driver, decorator, maintenance, staff** | Only the tasks assigned to them |
| **User** | Someone who just signed up and is waiting to be approved | A simple holding page until an admin promotes them |
| **Guest** | A person staying at a property | A self-service portal (guidebook, services, contact) |

**A simple way to remember it:**

```
Super-admin      →  the whole platform   (all businesses)
Admin / Co-admin →  one business         (their organization)
Cohost           →  some properties      (their assignments)
Employee         →  some tasks           (their work)
Guest            →  one stay             (their booking)
```

Each role lands on a different home page after logging in:

| Role | Lands on |
|---|---|
| Super-admin | `/super-admin` |
| Admin / Co-admin | `/admin/dashboard` |
| Cohost | `/cohost/dashboard` |
| Employee | `/employee` |
| User (pending) | `/user` |
| Guest | `/guest` |

---

## 3. What you can do with it (features)

### Properties
Create, edit, and approve rental listings. Each property has its own detail page with tabs for availability, reservations, tasks, team, and reports. Properties can be **imported by pasting a public listing URL** (Airbnb, Booking, Vrbo), which auto-fills the form.

### Availability calendar
A month-by-month calendar for each property showing which dates are free, pending, or confirmed. It syncs automatically with external booking sites through **iCal feeds** (the standard calendar format Airbnb and Booking provide).

### Reservations / bookings
Track every stay — whether entered by hand or imported from a feed. Store guest details, and send ready-made **WhatsApp messages** (guidebook link, arrival reminder, etc.) in French, English, or Arabic.

### Tasks
Assign cleaning, maintenance, driver, and decoration jobs to employees. Field staff get a **deliberately simple interface**: big buttons, photo upload, and voice notes — designed for someone working on a phone between jobs. Includes cleaning checklists and maintenance tickets.

### Team management
Add and manage cohosts and employees. Generate **QR sign-in codes** so employees can log in by scanning a code with their phone camera — no password to type (see [section 9](#9-the-qr-sign-in-system-explained)).

### Guest portal & guidebooks
Public-facing pages for guests: a digital guidebook, available services, partner offers, coupons, and a way to report issues — reachable by QR code at the property.

### Reports
Monthly PDF reports for revenue and occupancy, per property or across the whole portfolio.

### Reminders & notifications
WhatsApp reminder helpers and an in-app notification bell.

---

## 4. How it is built (technology)

Here is each technology and **what job it does**, in plain terms:

| Technology | Plain-English job |
|---|---|
| **React 18 + TypeScript** | Builds the screens you see and interact with. TypeScript catches mistakes before they ship. |
| **Vite** | The tool that bundles and serves the app quickly during development. |
| **Tailwind CSS** | The styling system — colors, spacing, layout — written as small utility classes. |
| **shadcn/ui + Radix** | Ready-made, accessible building blocks: buttons, dialogs, dropdowns, tables. |
| **lucide-react** | The icon set. |
| **TanStack Query (React Query)** | Fetches data from the server and **caches** it, so screens feel instant on repeat visits. |
| **React Router** | Decides which page to show for each web address (URL). |
| **Supabase** | The entire backend: login, database, file storage, and server functions. |
| **i18next** | Translates the app into French, English, and Arabic. |
| **jsPDF** | Generates the downloadable PDF reports. |
| **qrcode.react** | Draws the employee QR sign-in images in the browser. |
| **Vitest + Playwright** | Automated testing (unit tests and full browser tests). |
| **Vercel** | The hosting service the app is deployed to. |

> **What is Supabase?** It is an all-in-one backend. Instead of building separate servers for login, a database, file uploads, and custom code, Supabase provides all four. It is built on **PostgreSQL**, a well-known database.

---

## 5. How the pieces fit together (architecture)

At a high level, two layers talk to each other: the **browser app** and **Supabase**.

```
┌─────────────────────────────────────────────────────────────┐
│                      YOUR BROWSER                            │
│  The React app (pages, buttons, forms)                      │
│  - Reads your role, shows the right screens                 │
│  - Caches data with React Query                             │
└───────────────┬─────────────────────────────────────────────┘
                │  secure HTTPS requests
                ▼
┌─────────────────────────────────────────────────────────────┐
│                       SUPABASE                              │
│                                                             │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌───────────┐  │
│  │   Auth   │  │  Database  │  │  Storage │  │   Edge    │  │
│  │ (login)  │  │ (Postgres) │  │ (files)  │  │ Functions │  │
│  └──────────┘  └─────┬──────┘  └──────────┘  └───────────┘  │
│                      │                                      │
│              Row Level Security (RLS)                       │
│        every query is filtered by who you are              │
└─────────────────────────────────────────────────────────────┘
```

**The golden rule of this app:** your role is **always read fresh from the database** (the `profiles` table) before a page renders. The app never simply trusts what the browser claims you are. On top of that, the database itself enforces access with **Row Level Security** ([section 12](#12-how-data-is-kept-safe-security-model)).

**The data flow for a typical action**, e.g. an admin opening their dashboard:

1. The browser confirms you are logged in (Supabase Auth).
2. It reads your role and organization from the `profiles` table.
3. It fetches only the properties, tasks, and team that belong to your organization.
4. The database double-checks every one of those requests against its security rules.
5. React Query caches the result so returning to the page later is instant.

---

## 6. The data model (what is stored)

The database is a set of **tables**. Each table is like a spreadsheet: rows of records, columns of fields. Here are the important ones grouped by purpose. *(These are the tables that actually exist in the current schema.)*

### Core tables

| Table | What it holds |
|---|---|
| `organizations` | Each rental business (name, logo, brand color, limits, trial info) |
| `profiles` | Every user's account info and **role** (the source of truth for permissions) |
| `properties` | The rental listings (name, address, type, capacity, status) |
| `tasks` | Cleaning / maintenance / driver jobs (status, assignee, priority, due date) |
| `bookings` | Reservations / stays (guest name, phone, check-in, check-out, source) |
| `services` | Add-on services offered at a property |

The `profiles` table is central. Its key columns include: `id`, `full_name`, `email`, `phone`, `avatar_url`, `role`, `org_id`, `pending_org_id`, `pending_role`, `invitation_status`, `invited_by`, `language`, `whatsapp`, and `active`.

### Team & assignments

| Table | What it holds |
|---|---|
| `property_cohosts` | Which cohost manages which property (plus their `permissions` array) |
| `property_members` | Which employees are assigned to which property |
| `subscriptions` | Each organization's plan / billing status |
| `invoices` | Billing documents |
| `audit_log` | A record of sensitive actions for accountability |

### Tasks & operations

| Table | What it holds |
|---|---|
| `task_photos` | Before / during / after / issue photos uploaded for a task |
| `cleaning_checklists` | The checklist items for a cleaning task |
| `maintenance_tickets` | Reported maintenance issues |

### Calendar & bookings

| Table | What it holds |
|---|---|
| `property_ical_feeds` | The external calendar links (Airbnb, Booking) synced per property |
| `booking_channels` | The sources a booking can come from |

### Guest-facing

| Table | What it holds |
|---|---|
| `guest_accounts` | Temporary guest logins for a stay |
| `guest_books` | The digital guidebook content per property |
| `guest_messages` | Messages exchanged with guests |
| `guest_uploads` | Files guests upload (e.g. ID, photos) |
| `rental_items` | Items available to rent during a stay |

### Sign-in & security

| Table | What it holds |
|---|---|
| `staff_login_tokens` | The QR sign-in tokens for employees (only the *hash* is stored — see [section 9](#9-the-qr-sign-in-system-explained)) |

### Database helper views/functions
The schema also defines convenience database functions and views such as `my_org_id`, `is_org_admin`, `is_org_staff`, `property_org_id`, `bookings_with_property`, `tasks_with_property`, and `get_public_guest_book`. These are used by RLS policies and by the app to simplify common lookups.

### How the main tables relate

```
organizations
   │  (one organization has many…)
   ├──< profiles          (its users)
   ├──< properties        (its listings)
   │       │  (one property has many…)
   │       ├──< tasks
   │       ├──< bookings
   │       ├──< property_cohosts   >── profiles   (who manages it)
   │       ├──< property_members   >── profiles   (who works on it)
   │       └──< property_ical_feeds
   └──< subscriptions / invoices
```

> **Two naming notes:**
> - In the UI you will see the word "reservations", but the table is called `bookings`. Same thing.
> - Most tables scope data with a column named **`org_id`**. A few tables (e.g. `message_templates`, `staff_login_tokens`) use **`organization_id`** instead. When writing queries, check which one a given table uses.

---

## 7. Roles and permissions in depth

Roles are stored as a single text value in `profiles.role`. The helper file `src/lib/access.ts` turns that into easy yes/no checks the rest of the app uses.

### The role values

```
super_admin   admin   co_admin   cohost
cleaner   driver   decorator   maintenance   staff      (the "employee" group)
user      (pending signup, not yet approved)
guest     (a booking party)
```

### How a cohost is recognized

A cohost can be identified **two ways**:
1. Their `profiles.role` is literally `cohost`, **or**
2. They have at least one row in `property_cohosts` (a property assignment), regardless of their stored role.

This matters because some cohosts are created purely through property assignments. The app checks **both** so they are never accidentally locked out.

### The permission helpers (`src/lib/access.ts`)

| Helper | Answers the question |
|---|---|
| `isSuperAdminRole(role)` | Is this the platform operator? |
| `isAdminRole(role)` | Is this an admin, co-admin, or super-admin? |
| `isOrgAdminRole(role)` | Is this specifically an admin or co-admin? |
| `isEmployeeRole(role)` | Is this a cleaner / driver / decorator / maintenance / staff? |
| `isSuperAdminUser(userId)` | Server-checked: is this user a super-admin? (checks `profiles.role`, with a `user_roles` fallback for legacy installs) |
| `getUserAccess(userId)` | The big one: returns a full picture — role, organization, and booleans like `isAdmin`, `isCohost`, `isManager`, `isStaff` |

`getUserAccess` is the workhorse. It reads the profile **and** checks for cohost assignments (in parallel, for speed), then returns a tidy object the whole app relies on:

```typescript
import { getUserAccess } from "@/lib/access";

const access = await getUserAccess(user.id);
// access.role, access.orgId, access.dashboardPath
// access.isSuperAdmin, access.isAdmin, access.isCohost
// access.isManager  → admin OR cohost
// access.isStaff    → strictly an employee (no admin/cohost rights)
```

### How pages are protected

Every private page is wrapped in a `ProtectedRoute` component. You can require specific roles:

```tsx
<ProtectedRoute allow={["cohost", "admin", "super_admin"]}>
  <AppLayout><CohostEmployees /></AppLayout>
</ProtectedRoute>
```

- If you are not logged in → you are sent to the login page.
- If you are logged in but lack the role → you see an "Unauthorized" screen.
- **Super-admins implicitly pass every check** (so they can support any page).

This is the *first* line of defense (a nice user experience). The *real* enforcement happens in the database with RLS ([section 12](#12-how-data-is-kept-safe-security-model)).

---

## 8. Signing in (authentication)

There are several ways to get into the app, depending on who you are.

| Method | Who uses it | Page |
|---|---|---|
| **Email + password** | Admins, cohosts, most users | `/auth` |
| **Staff login** | Employees with a simple account | `/staff-login` |
| **QR code scan** | Employees (no typing) | `/qr-login` (see [section 9](#9-the-qr-sign-in-system-explained)) |
| **Password reset** | Anyone who forgot their password | `/reset-password` |

### What happens after login

1. Supabase confirms your email/password (or QR token) and creates a **session** (a secure, time-limited pass kept in your browser).
2. `AuthContext` (`src/contexts/AuthContext.tsx`) listens for that session and makes your user available everywhere in the app.
3. The app reads your role and sends you to your home page.
4. Sessions **auto-refresh** so you are not logged out mid-task.

### How sessions are managed

`AuthContext` is a small piece of code that:
- Holds the current `user` and `session`.
- Updates instantly when you log in or out (via Supabase's `onAuthStateChange`).
- Exposes a `signOut()` function used by the logout button.

---

## 9. The QR sign-in system explained

This is one of the app's signature features. Field employees often have **no email and limited literacy**, so typing a password on a phone is a barrier. Instead, a manager generates a **QR code** that the employee scans to sign in instantly.

### The simple version

```
Manager clicks "Generate QR"  →  a QR image appears
       │
       ▼
Manager prints it or sends the image to the employee
       │
       ▼
Employee opens their phone camera and scans it
       │
       ▼
Employee is signed in — no password typed
```

### The important security idea

The QR is a **bearer credential**: anyone holding the image can sign in as that employee until it is disabled. This was a deliberate product choice for low-literacy field staff. It is made safe by several rules:

- QR codes can **only** be issued for employee roles — never for an admin, cohost, or super-admin.
- Generating a new code **revokes** the previous one (one active code per person).
- A manager can **disable** a code instantly if it leaks.
- Only the **hash** (a one-way fingerprint) of the code is stored in the database — so even a database leak cannot be replayed as a login.
- The actual code lives only inside the QR image and in the URL fragment (`#...`), which is **never sent to servers or logs**.

### Who can generate a QR code

The rule is **"anyone above the employee who has access to them"**:

| Generator | Can generate for |
|---|---|
| Super-admin | Any employee in any organization |
| Admin / Co-admin | Any employee in **their own** organization |
| Cohost | Only employees who share a property with them |

This is enforced **on the server** (in the Edge Function), so the rule holds even if someone tampers with the browser.

### Where to generate one (in the app)

The "QR code" button appears next to employees on these pages:

- `/team` — admin's team page
- `/admin/employees` — admin's employee manager (inside the edit panel)
- `/super-admin/employees` — super-admin's employee manager (inside the edit panel)
- `/cohost/employees` — cohost's employee page

### How it works under the hood

Three server functions and one database table cooperate:

```
1. ISSUE  (staff-qr-issue)
   Manager clicks Generate →
   server checks authorization →
   creates a random token, stores its HASH →
   returns the token ONCE to the browser →
   browser draws it as a QR: <site>/qr-login#t=<token>

2. SCAN + REDEEM  (staff-qr-login)   [public]
   Employee scans → opens /qr-login →
   browser sends the token to the server →
   server hashes it, finds the matching active row →
   re-checks the user is still an employee →
   mints a one-time login code →
   browser completes sign-in.

3. DISABLE  (staff-qr-revoke)
   Manager clicks Disable →
   server marks all the employee's codes as revoked →
   the next scan fails.
```

The QR image itself is drawn entirely in the browser by the `qrcode.react` library. The server's job is only to **mint, store, and later validate the token** — the security part that cannot be trusted to a browser.

> **Important for printing:** the QR encodes whatever website address the manager is on at the time (`window.location.origin`). Always generate QR codes from the **real production website**, not a local test address — a code generated on `localhost` only works on that same computer.

---

## 10. Server functions (Edge Functions)

**Edge Functions** are small pieces of code that run on Supabase's servers, not in the browser. They are used for anything that needs **elevated privileges** or **secrets** that must never reach a browser.

> **Why not just do it in the browser?** Some actions — like creating another user's account, or signing someone in — require a powerful "service role" key. If that key were in the browser, anyone could steal it. Edge Functions keep it server-side.

| Function | What it does | Public? |
|---|---|---|
| `create-team-member` | Creates a new employee or cohost account and assigns properties | No (manager only) |
| `create-platform-staff` | Creates platform-level staff accounts | No (super-admin) |
| `create-guest-account` | Creates a temporary guest login for a stay | No |
| `cleanup-guest-accounts` | Removes expired guest accounts on a schedule | No (scheduled) |
| `sync-ical` | Pulls bookings from external calendars (Airbnb, Booking) | No |
| `import-listing` | Scrapes a public listing URL to pre-fill the new-property form | No |
| `set-user-banned` | Deactivates (or reactivates) a user account | No (admin) |
| `staff-qr-issue` | Creates an employee QR sign-in token | No (manager) |
| `staff-qr-revoke` | Disables an employee's QR sign-in tokens | No (manager) |
| `staff-qr-login` | Redeems a scanned QR into a login | **Yes** (the scanner is not yet signed in) |
| `inngest` | Background job / event handling | — |

**`verify_jwt`** in `supabase/config.toml` controls whether a function requires the caller to be logged in. Most are `true`. The exceptions are deliberate: `staff-qr-login` is `false` because the employee scanning the code is *not yet* signed in — the token in the request is their credential.

---

## 11. Page-by-page guide

Pages live in `src/pages/`. Here is what each major screen is for.

### Shared / entry
| Page | Purpose |
|---|---|
| `Auth` | Email/password login & signup |
| `StaffLogin` | Simplified login for employees |
| `QrLogin` | Lands here after scanning a QR; signs the employee in |
| `ResetPassword` | Password recovery |
| `Welcome` | First-run welcome / onboarding screen |
| `Home` | Routes you to the right dashboard based on role |
| `NotFound` | The 404 page |

### Manager surfaces (admin / cohost)
| Page | Purpose |
|---|---|
| `Dashboard` | Overview: property/team/task counts + your assigned properties |
| `Properties` | List, create, edit, approve properties |
| `PropertyDetail` | One property with tabs (availability, reservations, tasks, team, reports) |
| `Availability` | Month calendar with iCal sync |
| `Reservations` | Bookings list + WhatsApp message tools |
| `Tasks` | Create and assign jobs to staff |
| `Team` | Manage cohosts and employees; generate QR codes |
| `AdminCohosts` / `AdminEmployees` | Admin's role-specific people managers |
| `CohostEmployees` | Cohost's employee manager |
| `CohostDetail` | Details for a single cohost |
| `Reports` | Monthly PDF revenue/occupancy reports |
| `Rentals` / `Inventory` | Rentable items and stock |
| `Settings` | Personal profile + organization settings, templates, partners, albums |
| `Anomalies` | Flagged data issues |
| `Tickets` | Maintenance / issue tickets |

### Super-admin surfaces
| Page | Purpose |
|---|---|
| `SuperAdmin` | Platform overview of all organizations |
| `SuperAdminOrg` | Manage one organization |
| `SuperAdminAdmins` / `SuperAdminCohosts` / `SuperAdminEmployees` / `SuperAdminStaff` | People managers across all organizations |
| `SuperAdminProfiles` / `SuperAdminOtherProfiles` | All user profiles |
| `SuperAdminBilling` | Billing across organizations |
| `SuperAdminAccessRequests` | Approve people requesting admin access |

### Employee surface
| Page | Purpose |
|---|---|
| `UserDashboard` / `MyAgenda` | The employee's simple task agenda |
| `MyInvoices` | Their invoices |
| `Help` | Help content |

### Guest-facing (public)
| Page | Purpose |
|---|---|
| `GuestPortal` | The signed-in guest's home |
| `GuestBook` / `GuestBooks` | Digital guidebook(s) |
| `GuestReservation` | A guest's reservation details |
| `ReportIssue` | Guests report a problem |
| `RedeemCoupon` | Redeem an offer |
| `Showcase` | Public showcase of an organization's properties |
| `BookingRequests` | Incoming booking requests |

### Layout & guards (in `src/components/`)
| Component | Purpose |
|---|---|
| `AppLayout` | The shell: sidebar (desktop) + bottom nav (mobile), org logo, logout |
| `ProtectedRoute` | The role gate around every private page |
| `MagicLinkQR` | The QR generate / download / print / disable dialog |
| `AvatarUpload` | Profile-photo uploader (scoped to an organization folder) |

---

## 12. How data is kept safe (security model)

Security works in **two layers**. Both must agree before you see anything.

### Layer 1 — the app (user experience)
`ProtectedRoute` hides pages your role should not reach, and queries are written to fetch only your own data. This makes the app behave correctly and feel right — but a determined person could bypass the browser, so it is **not** the real lock.

### Layer 2 — the database (the real lock): Row Level Security
**Row Level Security (RLS)** is a PostgreSQL feature. Every table has rules that run on **every single query** and filter rows by who you are. Even if someone bypassed the app entirely and queried the database directly, RLS would still only return the rows they are allowed to see.

Example of the idea (not exact code):
> "On the `properties` table, a user may read a row only if the property's `org_id` equals their own organization, **or** they are a super-admin, **or** they are assigned to that property."

### Key security practices used in this app

- **Role read from the database, never trusted from the browser.** The `profiles` table is the single source of truth.
- **Secrets stay on the server.** The powerful service-role key lives only inside Edge Functions.
- **Tokens are stored hashed.** QR sign-in tokens are saved as a one-way hash; the raw value lives only in the QR image.
- **Sensitive operations go through Edge Functions** that re-check authorization on the server, so client-side checks can never be the only gate.
- **The `staff_login_tokens` table has RLS enabled with no public policy** — meaning no browser can read or write it directly; only the server functions can.
- **Audit logging** records sensitive actions in `audit_log`.

### A note for developers
When adding a new table or page:
1. Always wrap the page in `ProtectedRoute` with the required role(s).
2. Always add RLS policies to the table.
3. Read role/permissions via `getUserAccess` — do not re-invent role checks.
4. Never instantiate a new Supabase client — use the shared one at `src/integrations/supabase/client.ts`.

---

## 13. Languages and right-to-left support

The app speaks **three languages**, configured in `src/i18n/`:

| Code | Language | Text direction |
|---|---|---|
| `fr` | French (the default/fallback) | Left-to-right |
| `en` | English | Left-to-right |
| `ar` | Arabic | **Right-to-left (RTL)** |

How it works:
- Translation text lives in `src/i18n/locales/{fr,en,ar}.json`.
- The app auto-detects your language from your browser and remembers your choice in local storage.
- When Arabic is selected, the whole layout **flips to right-to-left** automatically (`dir="rtl"`), and fonts switch to ones that render Arabic well.
- In code, text is shown with the `t()` function and a fallback, e.g. `t("dashboard.title", { defaultValue: "Dashboard" })`. The `defaultValue` is what shows if a translation key is missing.

---

## 14. Developer guide

### Prerequisites
- **Node.js 18+** (20 LTS recommended)
- **npm** (a `package-lock.json` is committed)

### Install and run

```bash
npm install      # install dependencies
npm run dev      # start the dev server (Vite)
```

Open the local address Vite prints in your terminal.

### All available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build into `dist/` |
| `npm run build:dev` | Build in development mode |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Check code style with ESLint |
| `npm run test` | Run unit tests once (Vitest) |
| `npm run test:watch` | Run unit tests continuously |
| `npx playwright test` | Run full browser end-to-end tests |

### Project structure

```
src/
  pages/                  One file per screen (Dashboard, Properties, Tasks, …)
  components/             Shared components (AppLayout, ProtectedRoute, …)
  components/ui/          shadcn/ui building blocks (button, dialog, …)
  contexts/               AuthContext (current user/session)
  hooks/                  Reusable React hooks
  integrations/supabase/  The shared Supabase client + generated types
  lib/                    Helpers — access.ts (roles), utils, billing, …
  i18n/locales/           fr / en / ar translation files
  assets/                 Logos and images
supabase/
  functions/              Edge Functions (server code)
  migrations/             SQL files that build the database, in order
  config.toml             Supabase project + function config
e2e/                      Playwright end-to-end tests
electron/                 Optional desktop-app shell
```

### Connecting to Supabase

- The Supabase URL and public (anon) key are **embedded in `src/integrations/supabase/client.ts`**, so **no `.env` is required just to run the app**. (That file is auto-generated; do not edit it by hand.)
- **`supabase/config.toml` must point at the same project (`project_id`) that the client uses.** If they differ, Edge Function calls fail with *"Failed to send request to edge function."*

### Deploying database & functions (Supabase CLI)

```bash
supabase link --project-ref <your-project-ref>   # one-time
supabase db push                                  # apply migrations
supabase functions deploy <function-name>         # deploy a function
```

### Key conventions (from `CLAUDE.md`)
- Read the user's role from `profiles` before rendering — never trust client state.
- Wrap every private page in `ProtectedRoute`.
- Use the existing Supabase client; never create a second one.
- Keep the employee UI simple: big buttons, photo upload, voice notes.
- Only use the documented tables; do not invent new ones without a migration.

### Optional environment flags

```bash
# Log auth-redirect decisions to the console while debugging routing
VITE_DEBUG_AUTH_REDIRECT=true

# Playwright end-to-end test accounts (see e2e/)
E2E_BASE_URL=https://your-preview-url.vercel.app
E2E_SUPER_ADMIN_EMAIL=...        E2E_SUPER_ADMIN_PASSWORD=...
E2E_ADMIN_EMAIL=...              E2E_ADMIN_PASSWORD=...
E2E_COHOST_EMAIL=...             E2E_COHOST_PASSWORD=...
E2E_STAFF_EMAIL=...              E2E_STAFF_PASSWORD=...
```

---

## 15. Deployment

The app is deployed as a **static single-page app on Vercel**.

- `npm run build` produces the `dist/` folder.
- `vercel.json` rewrites **all** paths back to `/` so that client-side routing works even on a hard refresh or a deep link (e.g. landing directly on `/properties/123`).
- The database and Edge Functions live on **Supabase** and are deployed separately with the Supabase CLI (see [section 14](#14-developer-guide)).

```
Browser  ──►  Vercel (serves the React app)
                   │
                   └──►  Supabase (auth, database, storage, functions)
```

---

## 16. What is not built yet

To set expectations honestly, a few things are **planned or stubbed**, not finished:

- **Marketplace** (hosts renting equipment to each other, partner offers as a full B2B marketplace) — partially present as `rentals` / partner features, but the full marketplace is **not complete**.
- **WhatsApp sending API** — the app prepares ready-to-send WhatsApp message text and reminders, but automated server-side WhatsApp delivery is **not wired up**; messages are handed off to the user to send.

If you are reading the code and find a feature that looks half-present, check `CLAUDE.md` — it tracks what currently works versus what is missing.

---

## 17. Glossary

| Term | Plain meaning |
|---|---|
| **SPA (Single-Page App)** | A website that loads once and then updates the screen without full page reloads, feeling like an app. |
| **Multi-tenant** | One app instance serving many separate customer organizations, each isolated from the others. |
| **White-label** | The app can be re-branded (logo, colors) to look like the customer's own product. |
| **Role** | A label on your account (admin, cohost, employee…) that decides what you can see and do. |
| **Organization (org)** | One rental business using the app. |
| **Supabase** | The all-in-one backend: login, database, file storage, and server functions. |
| **PostgreSQL** | The relational database Supabase is built on. |
| **RLS (Row Level Security)** | Database rules that filter every query by who you are — the real security lock. |
| **Edge Function** | A small piece of code that runs on Supabase's servers, used for privileged or secret operations. |
| **Session** | A secure, time-limited pass kept in your browser proving you are logged in. |
| **iCal feed** | The standard calendar format (used by Airbnb, Booking) for syncing availability. |
| **Bearer credential** | Anything where simply *holding* it grants access (like the QR code). |
| **Hash** | A one-way scramble of data; you can verify a value against it but cannot reverse it. |
| **JWT (`verify_jwt`)** | A signed token proving you are logged in; some Edge Functions require it, some do not. |
| **Token** | A secret string that grants a specific, limited capability (like signing in via QR). |
| **i18n** | "Internationalization" — supporting multiple languages. |
| **RTL** | Right-to-left text direction, used for Arabic. |

---

*This document describes the application as built. For contributor rules and the table allow-list, see [`CLAUDE.md`](./CLAUDE.md). For a shorter project overview, see [`README.md`](./README.md).*
