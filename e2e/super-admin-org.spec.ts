import { expect, test, type Page } from "@playwright/test";
import {
  clearAuthState,
  hasCredentials,
  loginAs,
  superAdminCredentials,
} from "./helpers/auth";

// Domain that won't collide with real users. Each invite gets a fresh
// timestamped local-part so re-runs don't fight over the same auth.users row.
const INVITE_DOMAIN = "e2e-invites.abbiatti.test";

const uniqueOrgName = (prefix = "E2E Org") => `${prefix} ${Date.now()}`;
const uniqueAdminEmail = () =>
  `e2e-admin-${Date.now()}-${Math.floor(Math.random() * 1e6)}@${INVITE_DOMAIN}`;

async function gotoSuperAdmin(page: Page) {
  await page.goto("/super-admin");
  await expect(
    page.getByRole("heading", { name: /super admin/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
  // Wait for the org list query to settle so subsequent locators can rely on
  // the rendered rows.
  await page.waitForLoadState("networkidle").catch(() => {
    /* networkidle is best-effort in dev mode */
  });
}

async function createOrganization(page: Page, name: string) {
  await page.getByTestId("superadmin-new-agency-button").click();

  const dialog = page.getByTestId("org-create-dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByTestId("org-create-name-input").fill(name);
  await dialog.getByTestId("org-create-submit").click();

  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const row = page
    .getByTestId("org-row")
    .filter({ has: page.locator(`[data-org-name="${name}"]`) })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  return row;
}

async function inviteAdmin(
  page: Page,
  org: { name: string },
  admin: { fullName: string; email: string; password: string },
) {
  const row = page
    .getByTestId("org-row")
    .filter({ has: page.locator(`[data-org-name="${org.name}"]`) })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });

  await row.getByTestId("org-invite-admin-button").click();

  const dialog = page.getByTestId("invite-dialog");
  await expect(dialog).toBeVisible();
  // Title must be in admin mode so we don't accidentally invite a cohost.
  await expect(dialog.getByRole("heading")).toContainText(/invite admin/i);

  await dialog.getByTestId("invite-fullname-input").fill(admin.fullName);
  await dialog.getByTestId("invite-email-input").fill(admin.email);
  await dialog.getByTestId("invite-password-input").fill(admin.password);
  await dialog.getByTestId("invite-submit").click();

  // The dialog closes after a successful invite, and a toast confirming the
  // invitation appears. Either signal is enough — match whichever the app
  // emits to keep this resilient to copy changes.
  await Promise.race([
    expect(dialog).toBeHidden({ timeout: 15_000 }),
    expect(
      page.getByText(/admin invited|admin invité/i).first(),
    ).toBeVisible({ timeout: 15_000 }),
  ]);
}

async function deleteOrganization(page: Page, name: string) {
  const row = page
    .getByTestId("org-row")
    .filter({ has: page.locator(`[data-org-name="${name}"]`) })
    .first();

  if ((await row.count()) === 0) return;

  await row.getByTestId("org-delete-trigger").click();

  const confirm = page.getByTestId("org-delete-confirm");
  await expect(confirm).toBeVisible();
  await confirm.click();

  await expect(row).toHaveCount(0, { timeout: 15_000 });
}

test.describe("Super-admin organization management", () => {
  test.skip(
    !hasCredentials(superAdminCredentials),
    "E2E_SUPER_ADMIN_EMAIL/PASSWORD not set",
  );

  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
    await loginAs(
      page,
      superAdminCredentials.email,
      superAdminCredentials.password,
      { entryPath: "/auth", expectedPathname: "/super-admin" },
    );
    await gotoSuperAdmin(page);
  });

  test("super-admin creates a new organization", async ({ page }) => {
    const orgName = uniqueOrgName("E2E Create");

    try {
      await createOrganization(page, orgName);

      // Reload to confirm the row really came from the database, not just
      // optimistic UI state.
      await page.reload();
      await gotoSuperAdmin(page);

      const row = page
        .getByTestId("org-row")
        .filter({ has: page.locator(`[data-org-name="${orgName}"]`) })
        .first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText(orgName);
    } finally {
      // Clean up so the org list doesn't accumulate test data.
      await deleteOrganization(page, orgName);
    }
  });

  test("super-admin invites an admin to an organization", async ({ page }) => {
    const orgName = uniqueOrgName("E2E Invite");
    const admin = {
      fullName: "E2E Admin",
      email: uniqueAdminEmail(),
      password: "TempPass!234",
    };

    try {
      await createOrganization(page, orgName);
      await inviteAdmin(page, { name: orgName }, admin);

      // Drill into the org detail page and verify the pending-invitation panel
      // shows the new admin. This proves the invite reached the database, not
      // just the toast.
      const row = page
        .getByTestId("org-row")
        .filter({ has: page.locator(`[data-org-name="${orgName}"]`) })
        .first();
      await row.getByRole("link", { name: orgName }).click();

      await expect(
        page.getByRole("heading", { name: /pending invitations/i }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(admin.email)).toBeVisible();
    } finally {
      // Going back to the org list to delete cleans up cascaded rows
      // (user_roles, profile.pending_org_id link). The invited auth.users
      // row stays — its email is unique per run, so re-runs are unaffected.
      await page.goto("/super-admin");
      await gotoSuperAdmin(page);
      await deleteOrganization(page, orgName);
    }
  });

  test("super-admin org row exposes admin invite but not cohost invite", async ({
    page,
  }) => {
    // Guardrail: we removed the "Invite cohost" button from this page on
    // purpose. If someone re-adds it, this catches it.
    const orgName = uniqueOrgName("E2E Guard");

    try {
      await createOrganization(page, orgName);
      const row = page
        .getByTestId("org-row")
        .filter({ has: page.locator(`[data-org-name="${orgName}"]`) })
        .first();

      await expect(row.getByTestId("org-invite-admin-button")).toBeVisible();
      await expect(
        row.getByRole("button", { name: /invite cohost/i }),
      ).toHaveCount(0);
    } finally {
      await deleteOrganization(page, orgName);
    }
  });
});
