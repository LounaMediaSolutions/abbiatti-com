import { test, expect } from "@playwright/test";
import {
  adminCredentials,
  clearAuthState,
  cohostCredentials,
  expectAuthenticatedShell,
  hasCredentials,
  loginAs,
  staffCredentials,
  superAdminCredentials,
} from "./helpers/auth";

test.describe("Login and role-based redirection", () => {
  test("redirects unauthenticated users from protected routes to welcome with a redirect target", async ({
    page,
  }) => {
    await clearAuthState(page);

    await page.goto("/tasks");

    await page.waitForURL(/\/welcome\?redirect=/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/welcome\?redirect=%2Ftasks/);
    await expect(
      page.getByRole("heading", { name: /abbiatti/i }).or(page.getByText(/espace agence|espace employé/i)).first(),
    ).toBeVisible();
  });

  test.describe("manager login", () => {
    test.describe("super admin", () => {
      test.skip(
        !hasCredentials(superAdminCredentials),
        "E2E_SUPER_ADMIN_EMAIL/PASSWORD not set",
      );

      test("sends a super admin to the super admin dashboard", async ({
        page,
      }) => {
        await clearAuthState(page);
        await loginAs(
          page,
          superAdminCredentials.email,
          superAdminCredentials.password,
          {
            entryPath: "/auth",
            expectedPathname: "/super-admin",
          },
        );

        await expect(page).toHaveURL(/\/super-admin$/);
        await expectAuthenticatedShell(page, superAdminCredentials.email, {
          requireEmail: false,
          readyLocator: page.getByRole("heading", { name: /super admin/i }),
        });
      });
    });

    test.describe("admin", () => {
      test.skip(
        !hasCredentials(adminCredentials),
        "E2E_ADMIN_EMAIL/PASSWORD not set",
      );

      test("sends an admin to the admin dashboard", async ({ page }) => {
        await clearAuthState(page);
        await loginAs(page, adminCredentials.email, adminCredentials.password, {
          entryPath: "/auth",
          expectedPathname: "/admin/dashboard",
        });

        await expect(page).toHaveURL(/\/admin\/dashboard$/);
        await expectAuthenticatedShell(page, adminCredentials.email);
      });

      test("returns an admin to the originally requested protected route after login", async ({
        page,
      }) => {
        await clearAuthState(page);
        await page.goto("/settings");

        await page.waitForURL(/\/welcome\?redirect=%2Fsettings$/, {
          timeout: 15_000,
        });

        await page
          .getByRole("button", { name: /se connecter/i })
          .first()
          .click();

        await loginAs(page, adminCredentials.email, adminCredentials.password, {
          expectedPathname: "/settings",
        });

        await expect(page).toHaveURL(/\/settings$/);
        await expectAuthenticatedShell(page, adminCredentials.email);
      });
    });
  });

  test.describe("cohost login", () => {
    test.skip(
      !hasCredentials(cohostCredentials),
      "E2E_COHOST_EMAIL/PASSWORD not set",
    );

    test("sends a cohost to the cohost dashboard", async ({ page }) => {
      await clearAuthState(page);
      await loginAs(page, cohostCredentials.email, cohostCredentials.password, {
        entryPath: "/auth",
        expectedPathname: "/cohost/dashboard",
      });

      await expect(page).toHaveURL(/\/cohost\/dashboard$/);
      await expectAuthenticatedShell(page, cohostCredentials.email);
    });
  });

  test.describe("staff login", () => {
    test.skip(
      !hasCredentials(staffCredentials),
      "E2E_STAFF_EMAIL/PASSWORD not set",
    );

    test("sends a staff user to the employee agenda", async ({ page }) => {
      await clearAuthState(page);
      await loginAs(page, staffCredentials.email, staffCredentials.password, {
        entryPath: "/staff-login",
        expectedPathname: "/employee",
      });

      await expect(page).toHaveURL(/\/employee$/);
      await expectAuthenticatedShell(page, staffCredentials.email);
    });
  });
});
