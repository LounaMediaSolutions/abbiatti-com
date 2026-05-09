import { test, expect, Page } from "@playwright/test";

/**
 * E2E: A guest whose `guest_account` row was deleted (e.g. by the J+3 cleanup
 * job) must be signed out and redirected to /auth when opening /guest.
 *
 * Required env vars:
 *   E2E_BASE_URL                 - Preview/prod URL of the app (optional, defaults to localhost:8080)
 *   E2E_GUEST_EMAIL              - Email of a guest auth user with role=guest
 *                                  but NO row in public.guest_accounts
 *   E2E_GUEST_PASSWORD           - Password for that user
 *
 * To prepare the fixture, create a guest account via the cohost UI, then
 * delete the matching row in `guest_accounts` (keep the auth user + role).
 */

const EMAIL = process.env.E2E_GUEST_EMAIL ?? "";
const PASSWORD = process.env.E2E_GUEST_PASSWORD ?? "";

const AUTH_BUTTON_RE = /se connecter|connexion|sign in|log in|login|continuer|continue/i;
const AUTH_TITLE_RE = /connexion|se connecter|sign in|log in|login|welcome|bienvenue|auth/i;
const GUEST_ACCOUNT_ERROR_RE =
  /aucun compte invité|compte invité introuvable|guest account|no guest account|account (missing|deleted|not found)|session expirée|session expired|access denied|accès refusé/i;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth");

  const emailField = page
    .getByLabel(/e-?mail/i)
    .or(page.getByPlaceholder(/e-?mail/i))
    .or(page.locator('input[type="email"]'))
    .first();
  await expect(emailField).toBeVisible({ timeout: 10_000 });
  await emailField.fill(email);

  const passwordField = page
    .getByLabel(/mot de passe|password/i)
    .or(page.locator('input[type="password"]'))
    .first();
  await expect(passwordField).toBeVisible();
  await passwordField.fill(password);

  const submit = page
    .getByRole("button", { name: AUTH_BUTTON_RE })
    .or(page.locator('button[type="submit"]'))
    .first();
  await expect(submit).toBeEnabled();

  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 }),
    submit.click(),
  ]);
}

async function expectAuthScreenWithFeedback(page: Page) {
  const emailField = page
    .getByLabel(/e-?mail/i)
    .or(page.getByPlaceholder(/e-?mail/i))
    .or(page.locator('input[type="email"]'))
    .first();
  await expect(emailField).toBeVisible({ timeout: 10_000 });

  const passwordField = page
    .getByLabel(/mot de passe|password/i)
    .or(page.locator('input[type="password"]'))
    .first();
  await expect(passwordField).toBeVisible();

  const submit = page
    .getByRole("button", { name: AUTH_BUTTON_RE })
    .or(page.locator('button[type="submit"]'))
    .first();
  await expect(submit).toBeVisible();

  const authHeading = page
    .getByRole("heading", { name: AUTH_TITLE_RE })
    .or(page.getByText(AUTH_TITLE_RE))
    .first();

  await expect(authHeading.or(emailField)).toBeVisible();

  // Look for the error feedback in many possible containers:
  // - ARIA live regions (alert / status / alertdialog)
  // - Sonner / Radix / shadcn toast primitives
  // - Modal/dialog containers (Radix Dialog, AlertDialog)
  // - Inline form errors (form-message, error class, aria-invalid descriptions)
  // - Generic fallbacks (any element containing the localized text)
  const FEEDBACK_CONTAINERS = [
    '[role="alert"]',
    '[role="alertdialog"]',
    '[role="status"]',
    '[aria-live="assertive"]',
    '[aria-live="polite"]',
    '[data-sonner-toast]',
    'ol[data-sonner-toaster] li',
    '[data-radix-toast-root]',
    '[data-state="open"][role="dialog"]',
    '[data-radix-dialog-content]',
    '[data-radix-alert-dialog-content]',
    '.toast, .Toastify__toast, .sonner-toast',
    '[data-testid*="error" i]',
    '[data-testid*="toast" i]',
    '[data-testid*="alert" i]',
    '[class*="error" i]',
    '[class*="toast" i]',
    'p[id$="-form-item-message"]', // shadcn FormMessage
    '[aria-invalid="true"] ~ *',
  ].join(", ");

  const TOAST_SELECTOR = [
    '[data-sonner-toast]',
    'ol[data-sonner-toaster] li',
    '[data-radix-toast-root]',
    '.toast, .Toastify__toast, .sonner-toast',
    '[data-testid*="toast" i]',
    '[class*="toast" i]',
  ].join(", ");

  const MODAL_SELECTOR = [
    '[role="alertdialog"]',
    '[data-state="open"][role="dialog"]',
    '[data-radix-dialog-content]',
    '[data-radix-alert-dialog-content]',
  ].join(", ");

  const INLINE_SELECTOR = [
    '[role="alert"]',
    '[role="status"]',
    '[aria-live="assertive"]',
    '[aria-live="polite"]',
    'p[id$="-form-item-message"]',
    '[data-testid*="error" i]',
    '[class*="error" i]',
    '[aria-invalid="true"] ~ *',
  ].join(", ");

  const toastFeedback = page.locator(TOAST_SELECTOR).filter({ hasText: GUEST_ACCOUNT_ERROR_RE }).first();
  const modalFeedback = page.locator(MODAL_SELECTOR).filter({ hasText: GUEST_ACCOUNT_ERROR_RE }).first();
  const inlineFeedback = page.locator(INLINE_SELECTOR).filter({ hasText: GUEST_ACCOUNT_ERROR_RE }).first();
  const textFeedback = page.getByText(GUEST_ACCOUNT_ERROR_RE).first();

  // Global assertion: at least one variant must surface the error.
  const anyFeedback = toastFeedback.or(modalFeedback).or(inlineFeedback).or(textFeedback);
  await expect(anyFeedback).toBeVisible({ timeout: 10_000 });

  // Per-container assertions: count how many surfaces showed it, and assert
  // each known variant individually when present (soft expectations) so the
  // report shows which channel(s) delivered the feedback. On failure of any
  // per-container check, capture a screenshot attached to the test report so
  // we can quickly see whether the error surfaced as toast / modal / inline.
  const testInfo = test.info();

  async function captureOnMiss(label: string, locator: ReturnType<Page["locator"]>) {
    const count = await locator.count();
    const visible = count > 0 ? await locator.first().isVisible().catch(() => false) : false;

    if (!visible) {
      // Full-page screenshot to show context where the feedback should appear.
      const fullScreenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`missing-${label}-feedback-fullpage.png`, {
        body: fullScreenshot,
        contentType: "image/png",
      });

      // Also capture the auth screen viewport (cropped) for quick scanning.
      const viewportScreenshot = await page.screenshot();
      await testInfo.attach(`missing-${label}-feedback-viewport.png`, {
        body: viewportScreenshot,
        contentType: "image/png",
      });
    }
    return { count, visible };
  }

  const toastResult = await captureOnMiss("toast", toastFeedback);
  const modalResult = await captureOnMiss("modal", modalFeedback);
  const inlineResult = await captureOnMiss("inline", inlineFeedback);

  await expect
    .soft(toastResult.visible || toastResult.count === 0, "toast feedback expected to be visible when present")
    .toBeTruthy();
  await expect
    .soft(modalResult.visible || modalResult.count === 0, "modal feedback expected to be visible when present")
    .toBeTruthy();
  await expect
    .soft(inlineResult.visible || inlineResult.count === 0, "inline feedback expected to be visible when present")
    .toBeTruthy();

  // At least one specific container variant (toast/modal/inline) must match,
  // not only the generic text fallback.
  const matched = toastResult.count + modalResult.count + inlineResult.count;
  if (matched === 0) {
    const fullScreenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("no-container-feedback-fullpage.png", {
      body: fullScreenshot,
      contentType: "image/png",
    });
    await testInfo.attach("dom-snapshot.html", {
      body: await page.content(),
      contentType: "text/html",
    });
  }

  expect(
    matched,
    "expected error feedback in at least one of: toast, modal, inline container"
  ).toBeGreaterThan(0);
}

test.describe("Guest portal access control", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_GUEST_EMAIL/PASSWORD not set");

  test("redirects to /auth when guest_account is deleted", async ({ page }) => {
    await signIn(page, EMAIL, PASSWORD);

    await page.goto("/guest");

    await page.waitForURL(/\/auth(\?|$|#)/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/auth/);

    await expectAuthScreenWithFeedback(page);

    const hasSession = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.includes("supabase.auth"))
    );
    expect(hasSession).toBeFalsy();
  });
});
