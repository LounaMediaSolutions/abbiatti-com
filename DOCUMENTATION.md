# Escapar Project Documentation

## Overview
This codebase is transitioning from a legacy single-organization role-based app (formerly `abbiatti-com`) to a multi-sided marketplace and property management application named **Escapar**.

The app is built using **React, TypeScript, Vite, TailwindCSS**, and uses **Supabase** for the backend (Authentication, PostgreSQL Database, and Storage).

## Architecture & Data Model

The application has migrated away from a global `user_roles` linking table in favor of two primary authorization mechanisms:

1. **Global Roles (`profiles.role`)**
   Users have a global role defined in the `profiles` table. The `role` column uses string identifiers (e.g., `'admin'`, `'super_admin'`, `'co_admin'`).
   - Admins/Super Admins have global access and are routed directly to the Management Dashboard.
   - Staff/Cleaners default to the Employee App (`MyAgenda`).

2. **Property-Level Permissions (`property_cohosts`)**
   Granular access to specific properties is managed via the `property_cohosts` table. This maps a `user_id` to a `property_id` and contains a `permissions` array (e.g., `["manage_properties"]`).

### Key Entities
- **Organizations (`organizations`)**: Contains branding data (`logo_url`, `brand_color`) and the `org_id` used across the app to scope data.
- **Profiles (`profiles`)**: Extending the Supabase Auth user. Contains `role`, `org_id`, `full_name`, `phone`, etc.
- **Properties (`properties`)**: The core entity. Belongs to an `org_id`.
- **Tasks (`tasks`)**: Linked to properties. Can be assigned to staff members. Types include `cleaning` and `maintenance`.
- **Bookings (`bookings`)**: Replaced the legacy `reservations` table. Contains `checkin` and `checkout` dates.

## Application Modules (Scope)

As outlined in the roadmap, the application consists of several primary interfaces:

1. **Guest Portal** (`/g/:slug`)
   - Read-only property information, rules, and local area guides.
   - Upselling services (beach packs, baby beds, transfers).
   - *Status: In Development*

2. **Admin Dashboard** (`/`)
   - Full oversight of all properties, bookings, tasks, and team members.
   - Financial reporting and partner management.
   - *Access: Users with `profiles.role = 'admin' | 'super_admin' | 'co_admin'`*

3. **Cohost Dashboard**
   - Scoped view of the Admin Dashboard showing only properties where the user exists in `property_cohosts`.
   - Ability to manage tasks and staff for their specific properties.

4. **Employee App** (`/` for non-admins)
   - A simplified interface (`MyAgenda`) designed for mobile use by cleaners and maintenance staff.
   - Focused purely on checking off assigned tasks and uploading photo evidence.
   - *Access: Users without admin roles.*

5. **Partner Portal & Marketplace**
   - Allows partners to offer coupons and services.
   - Allows hosts to rent physical equipment from other hosts (B2B marketplace).
   - *Status: Planned*

## Recent Refactoring Notes

- **Removed `user_roles`**: Any legacy code checking `user_roles` has been removed. Role checks must go through `profiles.role` or the helpers in `src/lib/access.ts`.
- **Removed `organization_id`**: The column `organization_id` has been renamed to `org_id` across all major tables (`properties`, `profiles`, `tasks`, `bookings`).
- **Removed `property_members`**: Cohosting is now explicitly handled by `property_cohosts`.
- **Removed `maintenance_tickets`**: Maintenance issues are now tracked as `tasks` where `type = 'maintenance'`.
- **Removed `guest_messages` & `guest_books`**: These tables were dropped from the schema. Related UI components are currently disabled or pending rewrite.

## Getting Started

1. Ensure your local environment has `npm` and `node` installed.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start the Vite development server.
4. Environment variables (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) must be configured to connect to the "escapar" Supabase project.

## Access Control Layer (`src/lib/access.ts`)

When adding new pages or components, always use the centralized access helpers to determine what the user should see:

```typescript
import { getUserAccess } from "@/lib/access";

// Inside a component or loader:
const { isManager, isStaff } = await getUserAccess(user.id);
```

- `isManager`: True if the user is a global Admin OR a Cohost of at least one property.
- `isStaff`: True if the user is strictly an employee (no admin or cohost rights).
