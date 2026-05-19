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
const NEW_TASK_BUTTON_RE = /new task|nouvelle tâche|nouvelle tache|tâche/i;

async function openTasksPage(page: Page) {
  await page.goto("/tasks");
  await expect(
    page.getByRole("heading", { name: /^tasks$|^tâches$/i }),
  ).toBeVisible({ timeout: 15_000 });
}

async function openTaskForm(page: Page) {
  // Prefer the testid; fall back to the localized button name to keep the test
  // resilient if the testid is dropped during refactors.
  const trigger = page
    .getByTestId("open-task-dialog")
    .or(page.getByRole("button", { name: NEW_TASK_BUTTON_RE }))
    .first();
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await trigger.click();
  await expect(page.getByTestId("task-form")).toBeVisible({ timeout: 10_000 });
}

async function createTask(page: Page, title: string) {
  const form = page.getByTestId("task-form");

  await form.getByTestId("task-title-input").fill(title);

  // The form requires a title only; the rest of the fields (property, staff,
  // due date, guest name) are optional and we leave them untouched so the test
  // exercises the bare-minimum happy path.
  await form.getByTestId("task-save-button").click();

  // If saving errored, Sonner shows a toast inside the [role=status] region.
  // Surface that message in the assertion failure instead of timing out on
  // the card locator.
  await Promise.race([
    page.getByTestId("task-form").waitFor({ state: "detached", timeout: 15_000 }),
    page
      .locator('[data-sonner-toast][data-type="error"]')
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(async () => {
        const message = await page
          .locator('[data-sonner-toast][data-type="error"]')
          .first()
          .innerText();
        throw new Error(`Task save returned an error toast: ${message}`);
      }),
  ]);

  // Switch to "All tasks" so the new card shows regardless of who it was
  // assigned to (the form default is unassigned, while the list defaults to
  // "My tasks").
  const allTasksToggle = page
    .getByRole("button", { name: /^all tasks$|^toutes les tâches$/i })
    .first();
  if (await allTasksToggle.count()) {
    await allTasksToggle.click();
  }

  const card = page
    .getByTestId("task-card")
    .filter({ hasText: title })
    .first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  return card;
}

async function deleteTaskIfPresent(page: Page, title: string) {
  const card = page
    .getByTestId("task-card")
    .filter({ hasText: title })
    .first();

  if (!(await card.count())) return;

  // The trash icon button sits inside the card. Click it then confirm the
  // alert dialog.
  await card.locator("button").last().click();
  const confirm = page
    .getByRole("button", { name: DELETE_BUTTON_RE })
    .last();
  await confirm.click();
  await expect(card).toHaveCount(0, { timeout: 15_000 });
}

test.describe("Task creation", () => {
  test.describe("super admin", () => {
    test.skip(
      !hasCredentials(superAdminCredentials),
      "E2E_SUPER_ADMIN_EMAIL/PASSWORD not set",
    );

    test("creates a task as super-admin without schema errors", async ({ page }) => {
      const title = `E2E SuperAdmin Task ${Date.now()}`;

      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await clearAuthState(page);
      await loginAs(
        page,
        superAdminCredentials.email,
        superAdminCredentials.password,
        { entryPath: "/auth", expectedPathname: "/super-admin" },
      );

      await openTasksPage(page);
      await openTaskForm(page);
      await createTask(page, title);
      await deleteTaskIfPresent(page, title);

      // The schema-cache error we are guarding against shows up as a toast and
      // as a console error. Make sure neither variant slipped through.
      await expect(
        page.getByText(/created_by.*tasks.*schema cache|column tasks\.created_by/i),
      ).toHaveCount(0);
      expect(
        errors.filter((e) => /created_by.*tasks|column tasks\.created_by/i.test(e)),
      ).toEqual([]);
    });
  });

  test.describe("admin", () => {
    test.skip(
      !hasCredentials(adminCredentials),
      "E2E_ADMIN_EMAIL/PASSWORD not set",
    );

    test("creates a task as admin without schema errors", async ({ page }) => {
      const title = `E2E Admin Task ${Date.now()}`;

      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await clearAuthState(page);
      await loginAs(page, adminCredentials.email, adminCredentials.password, {
        entryPath: "/auth",
        expectedPathname: "/admin/dashboard",
      });

      await openTasksPage(page);
      await openTaskForm(page);
      await createTask(page, title);
      await deleteTaskIfPresent(page, title);

      await expect(
        page.getByText(/created_by.*tasks.*schema cache|column tasks\.created_by/i),
      ).toHaveCount(0);
      expect(
        errors.filter((e) => /created_by.*tasks|column tasks\.created_by/i.test(e)),
      ).toEqual([]);
    });
  });
});
