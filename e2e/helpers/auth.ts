import { expect, type Page } from "@playwright/test";

export const AUTH_BUTTON_RE =
  /se connecter|connexion|sign in|log in|login|continuer|continue/i;

export type LoginOptions = {
  entryPath?: "/auth" | "/staff-login";
  expectedPathname?: string | RegExp;
};

type CredentialEnv = {
  email: string;
  password: string;
};

export const adminCredentials: CredentialEnv = {
  email: process.env.E2E_ADMIN_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? "",
};

export const cohostCredentials: CredentialEnv = {
  email: process.env.E2E_COHOST_EMAIL ?? "",
  password: process.env.E2E_COHOST_PASSWORD ?? "",
};

export const staffCredentials: CredentialEnv = {
  email: process.env.E2E_STAFF_EMAIL ?? "",
  password: process.env.E2E_STAFF_PASSWORD ?? "",
};

export function hasCredentials({ email, password }: CredentialEnv) {
  return Boolean(email && password);
}

export async function clearAuthState(page: Page) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

export async function fillEmailAndPassword(
  page: Page,
  email: string,
  password: string,
) {
  const emailField = page
    .getByLabel(/e-?mail/i)
    .or(page.getByPlaceholder(/e-?mail/i))
    .or(page.locator('input[type="email"]'))
    .first();
  await expect(emailField).toBeVisible({ timeout: 10_000 });
  await emailField.fill(email);

  const passwordField = page
    .getByLabel(/mot de passe|password/i)
    .or(page.getByPlaceholder(/mot de passe|password/i))
    .or(page.locator('input[type="password"]'))
    .first();
  await expect(passwordField).toBeVisible();
  await passwordField.fill(password);
}

export async function submitLogin(
  page: Page,
  expectedPathname: string | RegExp,
) {
  const submit = page
    .getByRole("button", { name: AUTH_BUTTON_RE })
    .or(page.locator('button[type="submit"]'))
    .first();
  await expect(submit).toBeEnabled();

  await Promise.all([
    page.waitForURL((url) => {
      if (expectedPathname instanceof RegExp) {
        return expectedPathname.test(url.pathname);
      }
      return url.pathname === expectedPathname;
    }, { timeout: 15_000 }),
    submit.click(),
  ]);
}

export async function loginAs(
  page: Page,
  email: string,
  password: string,
  {
    entryPath = "/auth",
    expectedPathname,
  }: LoginOptions = {},
) {
  await page.goto(entryPath);
  await fillEmailAndPassword(page, email, password);
  await submitLogin(page, expectedPathname ?? /^(?!\/auth$|\/staff-login$).+/);
}

export async function expectAuthenticatedShell(
  page: Page,
  email: string,
) {
  await expect(
    page.getByRole("button", { name: /log out|logout|se déconnecter/i }).first(),
  ).toBeVisible({
    timeout: 10_000,
  });

  await expect(page.getByText(email, { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });

  await expect(page.getByRole("button", { name: AUTH_BUTTON_RE })).toHaveCount(0);
}
