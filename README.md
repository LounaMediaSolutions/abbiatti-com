# Welcome to your Lovable project

TODO: Document your project here

Here is the plan:

============================================================
TASK 1 (IMMEDIATE) – FIX ROLE-BASED REDIRECTION IN OLD APP
============================================================

The old app (abbiatti-com) has one problem:

- When I login as admin, I go to employee page ("My tasks")
- This is wrong. Admin should go to admin dashboard.

Please fix this first.

After this is fixed, we will move to the next tasks.

============================================================
FULL SCOPE OF THE APP (WHAT WE WILL BUILD TOGETHER)
============================================================

This is the complete app (ESCAPAR) that we will build step by step:

1. GUEST PAGE (escapar.net/g/ABC123)
   - Property info (WiFi, rules, address, maps)
   - Reservation details (dates, guests, price)
   - Services to book (pack plage, baby bed, WiFi, transfer, welcome basket)
   - Physical items to rent (scooter, car, baby chair, stroller, BBQ, beach tent)
   - Marketplace (hosts renting items to other hosts)
   - Partner offers (restaurants, beaches, excursions with QR codes or coupons)
   - Region information (best beaches, restaurants, activities, maps, hours)
   - Photo album (upload, watermark with Escapar logo, share to Instagram/Facebook)
   - Coupon system (discounts, promo codes)
   - WhatsApp messaging (contact cohost)
   - Check-out reminder + review links

2. ADMIN DASHBOARD
   - See all properties (add, edit, delete)
   - See all reservations
   - See all tasks
   - Manage cohosts (add, remove, set permissions)
   - Manage employees (cleaners, drivers, maintenance)
   - Manage partners (restaurants, beaches, excursions)
   - Manage coupons (create, edit, delete)
   - Manage marketplace (approve items, view rentals, see commissions)
   - See financial reports

3. COHOST DASHBOARD
   - See ONLY properties assigned to them
   - See ONLY tasks for their properties
   - Assign tasks to employees
   - Message guests via WhatsApp
   - Generate QR codes for properties
   - Manage marketplace items for their properties

4. EMPLOYEE DASHBOARD (exists, keep it)
   - See ONLY tasks assigned to them
   - Simple interface: BIG buttons, photo upload, voice recording
   - Mark task as done
   - QR code login (no email, only phone number)

5. PARTNER PORTAL
   - Create offers (title, discount, validity)
   - Generate QR code for offer
   - See usage analytics

6. MARKETPLACE (hosts renting items to other hosts)
   - Host A lists items (baby bed, pack plage, scooter, etc.)
   - Host B rents items from Host A
   - Delivery by driver
   - escapar takes 10% commission

============================================================
WHAT YOU CAN REUSE FROM THE OLD APP (abbiatti-com)
============================================================

✅ GOOD CODE – KEEP AND REUSE:

- Supabase database (project "escapar") – tables already exist
- Authentication – Supabase Auth is working
- Employee dashboard – simple UI with tasks
- Create employee dialog – phone-only creation
- QR code generation functions

❌ BAD CODE – IGNORE / REWRITE:

- All role-based routing (it's broken)
- Admin dashboard (missing)
- Cohost dashboard (missing)
- Any messy or hard-to-read code

============================================================
QUESTIONS FOR YOU
============================================================

1. Do you agree to work together on this project?
2. Can you fix the role-based redirection first?
3. How many hours per week can you work?
4. Do you understand the full scope of the app?

Let's start with TASK 1 (fix the redirection) and then we will discuss the next tasks.

Later, when the app is working well, we can talk about a stable monthly salary.

Please confirm.

Thank you.

- If user is admin → redirect to /admin/dashboard
- If user is cohost → redirect to /cohost/dashboard
- If user is employee (cleaner/driver) → redirect to /employee (My tasks)

super-admin
admin
cohost
cleaner, driver, decorator, maintenance, or staff

==================
= latest message =
==================

============================================================
WHAT WE ALREADY HAVE (READY)
============================================================

1. DOMAIN & HOSTING
   - abbiatti-com.vercel.app (working)
   - Supabase project "escapar" (database ready)

2. DATABASE (Supabase)
   - Tables already exist: profiles, properties, tasks, bookings, property_cohosts, organizations, services
   - Data exists (properties, bookings, etc.)

3. BASIC AUTHENTICATION
   - Supabase Auth is configured and working
   - Users can log in (admin, cohost, employee)

4. EMPLOYEE DASHBOARD (exists, works)
   - /employee/tasks page
   - Tasks list, photos, voice recording

5. CREATE EMPLOYEE (works)
   - Dialog to create employee with name + phone only
   - Generates QR code for login

============================================================
WHAT IS BROKEN OR MISSING
============================================================

1. ROLE‑BASED REDIRECTION (BROKEN)
   - Current: all users go to employee page after login
   - Must fix: Super Admin → /super-admin, Admin → /admin, Cohost → /cohost, Employee → /employee/tasks

2. ADMIN DASHBOARD (MISSING)
   - No dashboard for property owners
   - They cannot manage properties, see bookings, invite cohosts

3. COHOST DASHBOARD (MISSING)
   - No dashboard for cohosts
   - They cannot assign tasks, validate employee work

4. SUPER ADMIN DASHBOARD (MISSING)
   - No dashboard to validate Admins or Partners
   - No global statistics

5. GUEST PORTAL (PARTIALLY DONE)
   - I have a basic HTML/CSS version
   - Missing: services booking, partner offers, photo upload with watermark, coupons, WhatsApp automation

6. MARKETPLACE (MISSING)
   - Admins cannot rent items to other Admins yet

7. REVIEW SYSTEM (MISSING)
   - Guests cannot rate properties, cohosts cannot rate employees

8. WHATSAPP API (NOT CONFIGURED)
   - No automatic messages (welcome, reminders, check-out)

============================================================
WHAT YOU CAN HELP ME WITH (PAID TASKS)
============================================================

Here are the tasks I need your help with. You can pick any:

PRIORITY 1 (urgent – fix broken things):

- [ ] Fix role‑based redirection (all users go to wrong page)
- [ ] Create basic Admin dashboard (CRUD properties, invite cohosts)
- [ ] Create basic Cohost dashboard (tasks, employee management)

PRIORITY 2 (complete guest portal):

- [ ] Finish guest page (services booking, WhatsApp integration)
- [ ] Add photo upload with watermark
- [ ] Add partner offers display

PRIORITY 3 (marketplace & reviews):

- [ ] Add marketplace (rent items between hosts)
- [ ] Add review system (ratings and comments)

PRIORITY 4 (advanced):

- [ ] WhatsApp API setup (templates, automation)
- [ ] Security audit and performance optimization
- [ ] Deploy to escapar.net
