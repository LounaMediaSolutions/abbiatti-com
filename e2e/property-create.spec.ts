import { expect, test, type Page } from "@playwright/test";
import {
  adminCredentials,
  clearAuthState,
  hasCredentials,
  loginAs,
  superAdminCredentials,
} from "./helpers/auth";

const SAVE_BUTTON_RE = /save|enregistrer/i;
const DELETE_BUTTON_RE = /delete|supprimer/i;

async function openPropertyForm(page: Page) {
  await page.goto("/properties");
  await expect(
    page.getByRole("heading", { name: /properties|propriétés/i }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("open-property-dialog").click();
  await expect(page.getByTestId("property-form")).toBeVisible();
}

async function createProperty(page: Page, propertyName: string) {
  await page.getByTestId("property-name-input").fill(propertyName);
  await page.getByTestId("property-street-name-input").fill("Codex Street");
  await page.getByTestId("property-city-input").fill("Paris");
  await page.getByTestId("property-country-input").fill("France");

  const accessCodeField = page.getByTestId("property-access-code-input");
  if (await accessCodeField.count()) {
    await accessCodeField.fill("4826");
  }

  await page
    .getByTestId("property-form")
    .getByRole("button", { name: SAVE_BUTTON_RE })
    .click();

  const propertyCard = page
    .getByTestId("property-card")
    .filter({ hasText: propertyName })
    .first();
  await expect(propertyCard).toBeVisible({ timeout: 15_000 });
}

async function deleteProperty(page: Page, propertyName: string) {
  const propertyCard = page
    .getByTestId("property-card")
    .filter({ hasText: propertyName })
    .first();

  if (await propertyCard.count()) {
    await propertyCard.getByRole("button", { name: DELETE_BUTTON_RE }).click();
    await page.getByRole("button", { name: DELETE_BUTTON_RE }).last().click();
    await expect(propertyCard).toHaveCount(0, { timeout: 15_000 });
  }
}

test.describe("Property creation", () => {
  test.describe("super admin", () => {
    test.skip(
      !hasCredentials(superAdminCredentials),
      "E2E_SUPER_ADMIN_EMAIL/PASSWORD not set",
    );

    test("creates a property from the super-admin portal", async ({ page }) => {
      const propertyName = `E2E Super Admin Property ${Date.now()}`;

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

      await openPropertyForm(page);
      await createProperty(page, propertyName);
      await deleteProperty(page, propertyName);
    });
  });

  test.describe("admin", () => {
    test.skip(
      !hasCredentials(adminCredentials),
      "E2E_ADMIN_EMAIL/PASSWORD not set",
    );

    test("creates a property from the admin portal", async ({ page }) => {
      const propertyName = `E2E Admin Property ${Date.now()}`;

      await clearAuthState(page);
      await loginAs(page, adminCredentials.email, adminCredentials.password, {
        entryPath: "/auth",
        expectedPathname: "/admin/dashboard",
      });

      await openPropertyForm(page);
      await createProperty(page, propertyName);
      await deleteProperty(page, propertyName);
    });
  });
});
