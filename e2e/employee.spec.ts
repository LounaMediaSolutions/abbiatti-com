import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  clearAuthState,
  expectAuthenticatedShell,
  hasCredentials,
  loginAs,
  loginAsStaff,
  staffCredentials,
} from "./helpers/auth";

/**
 * End-to-end coverage for the **employee** (field staff) experience:
 * cleaner / driver / decorator / maintenance / staff.
 *
 * Employees get the simplified agenda at `/employee` (MyAgenda) — no dense
 * tables, big tap targets, photo upload and voice/issue reporting. These tests
 * exercise authentication, the agenda surface, the task lifecycle
 * (start → complete, photo, report a problem, cleaning checklist), navigation,
 * and access isolation from manager-only surfaces.
 *
 * Data dependency: lifecycle tests act on tasks already assigned to the staff
 * account. Employees cannot create their own tasks, so where no actionable task
 * exists the test skips with a clear annotation rather than failing. To get full
 * coverage, seed the staff user with at least one `todo` task (one of them a
 * cleaning task) before running.
 */

const AGENDA_TITLE_RE = /^my tasks$|^mes tâches$/i;
const ERROR_TOAST = '[data-sonner-toast][data-type="error"]';
const TINY_JPG = "e2e/fixtures/tiny.jpg";

// ─────────────────────────── helpers ───────────────────────────

async function openAgenda(page: Page) {
  await page.goto("/employee");
  await expect(
    page.getByRole("heading", { name: AGENDA_TITLE_RE }),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Capture UNCAUGHT JS exceptions so we can assert the agenda renders without a
 * runtime crash. We listen on `pageerror` (real thrown errors) rather than
 * console "error" logs — the latter also fire for benign network responses
 * (e.g. a backend 4xx) which are not React/runtime failures and would make the
 * assertion brittle.
 */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/**
 * Find the first agenda task card that contains the given action testid
 * (e.g. a startable or completable task). Returns the card Locator, or null
 * when none exists so the caller can skip gracefully.
 */
async function findCardWith(page: Page, actionTestId: string): Promise<Locator | null> {
  const card = page
    .getByTestId("agenda-task-card")
    .filter({ has: page.getByTestId(actionTestId) })
    .first();
  return (await card.count()) > 0 ? card : null;
}

async function expectNoErrorToast(page: Page, timeout = 6_000) {
  // If an error toast appears, surface its text in the failure.
  const toast = page.locator(ERROR_TOAST).first();
  const appeared = await toast
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    const message = await toast.innerText();
    throw new Error(`Unexpected error toast: ${message}`);
  }
}

// ─────────────────────────── auth ───────────────────────────

test.describe("Employee — authentication", () => {
  test.skip(
    !hasCredentials(staffCredentials),
    "E2E_STAFF_EMAIL/PASSWORD not set",
  );

  test("signs in via /staff-login and lands on the agenda", async ({ page }) => {
    await clearAuthState(page);
    await loginAsStaff(page);

    await expect(page).toHaveURL(/\/employee$/);
    await expect(
      page.getByRole("heading", { name: AGENDA_TITLE_RE }),
    ).toBeVisible({ timeout: 15_000 });
    await expectAuthenticatedShell(page, staffCredentials.email);
  });

  test("the generic /auth entry also routes an employee to /employee", async ({ page }) => {
    await clearAuthState(page);
    await loginAs(page, staffCredentials.email, staffCredentials.password, {
      entryPath: "/auth",
      expectedPathname: "/employee",
    });

    await expect(page).toHaveURL(/\/employee$/);
  });

  test("an unauthenticated employee route redirects to welcome with a redirect target", async ({
    page,
  }) => {
    await clearAuthState(page);
    await page.goto("/employee");

    await page.waitForURL(/\/welcome\?redirect=%2Femployee/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/welcome\?redirect=%2Femployee/);
  });
});

test.describe("Employee — QR sign-in page", () => {
  // No credentials needed: this exercises the page's own error handling for a
  // bad/expired token, which is deterministic regardless of backend state.
  test("shows a recoverable error for an invalid QR token", async ({ page }) => {
    await clearAuthState(page);
    // A syntactically plausible but non-existent token (>20 chars). Whether the
    // edge function rejects it or is unreachable, the page must land in its
    // error state and offer the password fallback.
    await page.goto(`/qr-login#t=${"z".repeat(40)}`);

    await expect(
      page
        .getByText(/didn.?t work|n.a pas fonctionné|code/i)
        .or(page.getByRole("button", { name: /password|mot de passe/i }))
        .first(),
    ).toBeVisible({ timeout: 20_000 });

    // The token must be stripped from the address bar immediately.
    await expect(page).toHaveURL(/\/qr-login$/);
  });
});

// ─────────────────────────── agenda surface ───────────────────────────

test.describe("Employee — agenda surface", () => {
  test.skip(
    !hasCredentials(staffCredentials),
    "E2E_STAFF_EMAIL/PASSWORD not set",
  );

  test("renders the greeting header and tasks (or a friendly empty state) without a runtime crash", async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);

    await clearAuthState(page);
    await loginAsStaff(page);
    await openAgenda(page);

    // Greeting header is always present once loaded.
    await expect(page.getByText(/^hello$|^bonjour$/i).first()).toBeVisible();

    // Either there are task cards, or the empty state is shown — never a blank.
    const taskCards = page.getByTestId("agenda-task-card");
    const cardCount = await taskCards.count();
    if (cardCount === 0) {
      await expect(
        page.getByText(/no tasks scheduled|aucune tâche prévue/i),
      ).toBeVisible();
    } else {
      await expect(taskCards.first()).toBeVisible();
      await expect(page.getByTestId("agenda-task-title").first()).toBeVisible();
    }

    // No uncaught JS exception thrown while rendering the agenda.
    expect(pageErrors).toEqual([]);
  });

  test("does not expose manager-only navigation to an employee", async ({ page }) => {
    await clearAuthState(page);
    await loginAsStaff(page);
    await openAgenda(page);

    // Positive: the simple employee nav is present.
    await expect(
      page.getByRole("link", { name: /^settings$|^paramètres$/i }).first(),
    ).toBeVisible();

    // Negative: super-admin / org-management nav items must never appear.
    await expect(
      page.getByRole("link", { name: /^organizations$|^organisations$/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /^admins$/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /^profiles$|^profils$/i }),
    ).toHaveCount(0);
  });
});

// ─────────────────────────── task lifecycle ───────────────────────────

test.describe("Employee — task lifecycle", () => {
  test.skip(
    !hasCredentials(staffCredentials),
    "E2E_STAFF_EMAIL/PASSWORD not set",
  );

  test("starts a to-do task (todo → in progress)", async ({ page }) => {
    await clearAuthState(page);
    await loginAsStaff(page);
    await openAgenda(page);

    const card = await findCardWith(page, "task-start-button");
    test.skip(card === null, "No startable (todo) task assigned to the staff user");

    await card!.getByTestId("task-start-button").click();

    // After starting, the same card must offer the Complete action and no
    // longer offer Start.
    await expect(card!.getByTestId("task-done-button")).toBeVisible({ timeout: 15_000 });
    await expect(card!.getByTestId("task-start-button")).toHaveCount(0);
    await expectNoErrorToast(page);
  });

  test("completes an in-progress task (in progress → done)", async ({ page }) => {
    await clearAuthState(page);
    await loginAsStaff(page);
    await openAgenda(page);

    const card = await findCardWith(page, "task-done-button");
    test.skip(card === null, "No in-progress task assigned to the staff user");

    await card!.getByTestId("task-done-button").click();

    // Once done, the Complete action is gone (a done task exposes neither
    // Start nor Complete).
    await expect(card!.getByTestId("task-done-button")).toHaveCount(0, { timeout: 15_000 });
    await expectNoErrorToast(page);
  });

  test("uploads a photo to a task", async ({ page }) => {
    await clearAuthState(page);
    await loginAsStaff(page);
    await openAgenda(page);

    const card = await findCardWith(page, "task-photo-button");
    test.skip(card === null, "No task with photo upload available for the staff user");

    // The input is visually hidden (sr-only) but present; setInputFiles works
    // on hidden inputs without clicking the label.
    await card!.getByTestId("task-photo-input").setInputFiles(TINY_JPG);

    // We assert the absence of an error toast rather than a specific success
    // string, so the test is resilient to copy changes but still catches an
    // RLS / storage failure (which surfaces as an error toast).
    await expectNoErrorToast(page, 10_000);
  });

  test("reports a problem on a task", async ({ page }) => {
    await clearAuthState(page);
    await loginAsStaff(page);
    await openAgenda(page);

    // The "report a problem" action is present on every task card.
    const card = await findCardWith(page, "task-report-problem-button");
    test.skip(card === null, "No tasks in the staff agenda to report a problem on");

    await card!.getByTestId("task-report-problem-button").click();

    const dialog = page.getByTestId("report-problem-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog
      .getByTestId("problem-title-input")
      .fill(`E2E issue ${Date.now()}`);
    await dialog
      .getByTestId("problem-description-input")
      .fill("Reported by an automated employee E2E test.");
    await dialog.getByTestId("problem-submit-button").click();

    // Success closes the dialog; a failure would keep it open and toast an error.
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expectNoErrorToast(page);
  });

  test("opens the cleaning checklist for a cleaning task", async ({ page }) => {
    await clearAuthState(page);
    await loginAsStaff(page);
    await openAgenda(page);

    // The checklist toggle only renders for cleaning-type tasks.
    const card = await findCardWith(page, "task-checklist-toggle");
    test.skip(card === null, "No cleaning task assigned to the staff user");

    await card!.getByTestId("task-checklist-toggle").click();
    await expect(card!.getByTestId("task-checklist-panel")).toBeVisible({ timeout: 10_000 });
  });
});

// ─────────────────────────── navigation & access control ───────────────────────────

test.describe("Employee — navigation & access control", () => {
  test.skip(
    !hasCredentials(staffCredentials),
    "E2E_STAFF_EMAIL/PASSWORD not set",
  );

  test("can open the Properties surface from the employee nav", async ({ page }) => {
    await clearAuthState(page);
    await loginAsStaff(page);
    await openAgenda(page);

    await page.goto("/properties");
    // Employees see a (scoped) properties view, not an Unauthorized screen.
    await expect(
      page.getByRole("heading", { name: /accès non autorisé/i }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/properties$/);
  });

  test("is blocked from the super-admin area", async ({ page }) => {
    await clearAuthState(page);
    await loginAsStaff(page);
    await openAgenda(page);

    await page.goto("/super-admin");
    // ProtectedRoute(allow=['super_admin']) renders the Unauthorized screen.
    await expect(
      page.getByRole("heading", { name: /accès non autorisé/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("is blocked from the manager Team surface", async ({ page }) => {
    await clearAuthState(page);
    await loginAsStaff(page);
    await openAgenda(page);

    await page.goto("/team");
    // /team has no route-level role list, but Team.tsx itself gates non-managers
    // (not admin/co-admin/cohost) behind a "no access" message — so an employee
    // still cannot see or manage the team roster.
    await expect(
      page.getByText(/don.?t have access to this section|n.avez pas accès à cette section/i),
    ).toBeVisible({ timeout: 15_000 });
    // And none of the team-management chrome leaks through.
    await expect(
      page.getByRole("button", { name: /add (employee|member)|ajouter/i }),
    ).toHaveCount(0);
  });

  test("can log out", async ({ page }) => {
    await clearAuthState(page);
    await loginAsStaff(page);
    await openAgenda(page);

    await page
      .getByRole("button", {
        name: /log out|logout|se déconnecter|déconnexion/i,
      })
      .first()
      .click();

    // handleLogout signs out and navigates to /welcome itself — wait for that
    // rather than racing it with a manual navigation.
    await page.waitForURL(/\/welcome|\/auth|\/staff-login/, { timeout: 15_000 });

    // And the session is truly gone: a protected route now bounces to welcome.
    await page.goto("/employee");
    await page.waitForURL(/\/welcome\?redirect=%2Femployee|\/auth|\/staff-login/, {
      timeout: 15_000,
    });
  });
});
