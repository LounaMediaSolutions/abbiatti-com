# Escapar

A multi-tenant **vacation-rental property management** SaaS. Property owners, co-hosts, field staff and guests each get a role-scoped experience: managers run the portfolio, co-hosts handle their assigned properties, employees see only their tasks, and guests get a self-service portal (guidebook, services, WhatsApp contact).

The app is a single-page React application backed by Supabase (auth, Postgres, storage, edge functions) and deployed on Vercel. It is white-label aware — each organization can set its own logo and brand color.

---

## Features

- **Properties** — create, edit and approve listings; per-property detail view with tabs for availability, reservations, tasks and reports.
- **Availability** — month calendar per property with iCal feed sync (Airbnb, Booking, etc.).
- **Reservations** — manual + imported bookings, guest details, and ready-to-send WhatsApp message templates (FR / EN / AR).
- **Tasks** — cleaning / maintenance / driver jobs assigned to staff, with photo upload and voice notes; simplified big-button UI for field employees.
- **Reports** — monthly PDF revenue/occupancy reports (per property or all).
- **Guest portal & guidebooks** — public guest pages, QR check-in, services and partner offers.
- **Roles & access control** — super-admin, admin, co-host and employee roles, enforced via Supabase Row Level Security and `ProtectedRoute`.
- **Internationalization** — French, English and Arabic via `i18next`.

---

## Tech stack

| Area | Choice |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui (Radix primitives) + lucide-react |
| Data / server state | TanStack Query |
| Backend | Supabase (Auth, Postgres, Storage, Edge Functions) |
| Routing | React Router |
| i18n | i18next / react-i18next |
| PDF | jsPDF + jspdf-autotable |
| Testing | Vitest + Testing Library (unit), Playwright (E2E) |
| Hosting | Vercel (SPA) |

---

## Getting started

### Prerequisites

- Node.js 18+ (20 LTS recommended)
- npm (a `package-lock.json` is committed; `bun.lockb` is also present if you prefer bun)

### Install

```bash
npm install
```

### Run the dev server

```bash
npm run dev
```

Vite serves the app at http://localhost:5173 by default.

### Environment variables

The Supabase project URL and public (anon) key are currently embedded in
`src/integrations/supabase/client.ts`, so no `.env` is required just to run the app.

A `.env` file is used only for optional flags and end-to-end test credentials:

```bash
# Optional: log auth redirect decisions in the console while debugging routing
VITE_DEBUG_AUTH_REDIRECT=true

# Playwright E2E accounts (see e2e/)
E2E_BASE_URL=https://your-preview-url.vercel.app
E2E_SUPER_ADMIN_EMAIL=...
E2E_SUPER_ADMIN_PASSWORD=...
E2E_ADMIN_EMAIL=...
E2E_ADMIN_PASSWORD=...
E2E_COHOST_EMAIL=...
E2E_COHOST_PASSWORD=...
E2E_STAFF_EMAIL=...
E2E_STAFF_PASSWORD=...
```

---

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run build:dev` | Build in development mode |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests once (Vitest) |
| `npm run test:watch` | Run unit tests in watch mode |

End-to-end tests run through Playwright:

```bash
npx playwright test
```

---

## Roles & routing

User roles are read from the `profiles` table on every page load — never trusted from
client state — and pages are wrapped in `ProtectedRoute` with the required role(s).

| Role | Landing route |
|---|---|
| super-admin | `/super-admin` |
| admin | `/admin/dashboard` |
| co-host | `/cohost/dashboard` |
| cleaner / driver / decorator / maintenance / staff | `/employee` |

Availability, reservations, tasks and reports are reached through a property:
`/properties` → open a property → `/properties/:id` (tabbed detail).

---

## Project structure

```
src/
  pages/                 Route-level screens (Properties, PropertyDetail, Tasks, …)
  components/            Shared components, incl. AppLayout & ProtectedRoute
  components/ui/         shadcn/ui primitives
  contexts/             AuthContext and other providers
  hooks/                Reusable hooks
  integrations/supabase/ Supabase client + generated types
  lib/                  Helpers (access control, utils)
  i18n/locales/         fr / en / ar translation files
  assets/               Logos and static assets
supabase/
  functions/            Edge functions (sync-ical, create-team-member, …)
  migrations/           SQL migrations
  config.toml           Supabase project config
e2e/                    Playwright specs
electron/               Optional Electron desktop shell
```

---

## Backend (Supabase)

- **Project:** `escapar`
- **Core tables:** `profiles`, `properties`, `tasks`, `bookings`, `property_cohosts`, `organizations`, `services`
- **Edge functions** (in `supabase/functions/`): `sync-ical`, `create-guest-account`, `create-team-member`, `create-platform-staff`, `generate-magic-link`, `import-listing`, `set-user-banned`, `cleanup-guest-accounts`, `inngest`
- **Migrations:** `supabase/migrations/`

Access is scoped per role through Row Level Security; the front end additionally guards
routes and queries so each dashboard only sees data it is allowed to.

---

## Deployment

Deployed as a static SPA on **Vercel**. `vercel.json` rewrites all paths to `/` so client-side
routing works on hard refresh and deep links.

```bash
npm run build   # outputs to dist/
```

---

## Contributing

Project conventions, the role map, the table allow-list and the skills/agents used for
this codebase are documented in [`CLAUDE.md`](./CLAUDE.md). A few rules worth repeating:

- Read the user's role from `profiles` before rendering — never trust client state.
- Use the existing Supabase client in `src/integrations/supabase/client.ts`; don't create new ones.
- Keep the employee UI simple (big buttons, photo/voice), and only query the tables listed in `CLAUDE.md`.
