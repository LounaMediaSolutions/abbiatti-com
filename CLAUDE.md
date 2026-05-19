# CLAUDE.md — ESCAPAR

## Overview
Vacation rental property management SaaS.
Stack: React + TS + Tailwind, Supabase (auth/db), Vercel.
Supabase project: `escapar`.

## Role Map
| Role | Route |
|---|---|
| super-admin | `/super-admin` |
| admin | `/admin` |
| cohost | `/cohost` |
| cleaner / driver / decorator / maintenance / staff | `/employee/tasks` |

## Rules
- Always read role from `profiles` table before rendering any page — never trust client state.
- Role-routing is broken — rewrite cleanly, do not patch old logic.
- Each dashboard shows ONLY data scoped to that role (admin → org, cohost → assigned properties, employee → own tasks).
- Employee UI stays simple: big buttons, photo upload, voice recording. No dense tables.
- Tables in scope: `profiles`, `properties`, `tasks`, `bookings`, `property_cohosts`, `organizations`, `services`. Do not invent tables.
- Wrap every new page in `ProtectedRoute` with required role(s).
- Use existing Supabase client at `src/integrations/supabase/client.ts` — do not instantiate new ones.
- Marketplace + WhatsApp API are missing — stub or omit, do not fake.

## Status
Works: Supabase auth, `/employee/tasks`, create-employee dialog, QR code generation.
Broken/missing: role routing, admin/cohost/super-admin dashboards, marketplace, WhatsApp API.

## Skills (read before relevant work)
- `.claude/skills/frontend-patterns` → React/Tailwind UI patterns
- `.claude/skills/backend-patterns` → Supabase queries, RLS, caching
- `.claude/skills/coding-standards` → TypeScript rules, file organization
- `.claude/skills/security-review` → auth, RLS, role isolation
- `.claude/skills/tdd-workflow` → test-first development
- `.claude/skills/strategic-compact` → when to /compact

## Agents (invoke before relevant work)
- `.claude/agents/planner.md` → before building any dashboard
- `.claude/agents/architect.md` → for role routing and system design
- `.claude/agents/security-reviewer.md` → for any auth or RLS work
- `.claude/agents/code-reviewer.md` → before committing
