import { expect, test } from "@playwright/test";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };
import {
  createAccount,
  emailedCode,
  expectNoHorizontalScroll,
  hasLocalSupabase,
  pageAlert,
  signInAsNewAdmin,
  signInWithEmailCode,
  totp,
} from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const CODE_FORMAT = /^SKCE-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;
const inv = en.admin.invites;

test.describe("access", () => {
  test("signed-out visitors are sent to sign-in", async ({ page }) => {
    await page.goto("/en/admin/invites");
    await expect(page).toHaveURL(/\/en\/sign-in$/);
    await expect(page.getByRole("heading", { name: en.auth.title })).toBeVisible();
  });

  test("an unknown email gets the same answer as a real one", async ({ page }) => {
    await page.goto("/en/sign-in");
    await page.locator("#email").fill("nobody@hallyustars.test");
    await page.locator("#email").press("Enter");
    await expect(page.getByRole("heading", { name: en.auth.checkEmailTitle })).toBeVisible();
  });

  test("a fan can't see the admin area", async ({ page }, testInfo) => {
    const email = await createAccount("fan", testInfo);
    await signInWithEmailCode(page, "en", email);
    await expect(page).toHaveURL(/\/en\/celebrities$/);
    const response = await page.goto("/en/admin/invites");
    expect(response?.status()).toBe(404);
  });

  test("an admin who has only entered the email code can't reach admin pages", async ({ page }, testInfo) => {
    const email = await createAccount("admin", testInfo);
    await signInWithEmailCode(page, "en", email);
    await expect(page.getByRole("heading", { name: en.auth.mfaEnrollTitle })).toBeVisible();

    await page.goto("/en/admin/invites");
    await expect(page).toHaveURL(/\/en\/sign-in$/);
    // They resume at the authenticator step, not the email step.
    await expect(page.getByRole("heading", { name: en.auth.mfaEnrollTitle })).toBeVisible();
  });

  test("a wrong authenticator code is refused", async ({ page }, testInfo) => {
    const email = await createAccount("admin", testInfo);
    await signInWithEmailCode(page, "en", email);
    await page.locator("#mfa-code").fill("000000");
    await page.locator("#mfa-code").press("Enter");
    await expect(pageAlert(page)).toHaveText(en.auth.errors.invalidCode);
    await expect(page).toHaveURL(/\/en\/sign-in$/);
  });
});

test.describe("invites", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("create, copy, regenerate and revoke", async ({ page }, testInfo) => {
    await signInAsNewAdmin(page, "en", await createAccount("admin", testInfo));
    await expect(page.getByRole("heading", { level: 1, name: inv.title })).toBeVisible();

    // Create
    const fanName = `Fan ${testInfo.project.name} ${Date.now()}`;
    const fanEmail = `fan-${Date.now()}-${testInfo.project.name}@fans.test`;
    await page.getByLabel(inv.fanName).fill(fanName);
    await page.getByLabel(inv.email).fill(fanEmail);
    await page.getByRole("button", { name: inv.create }).click();

    const issued = page.getByTestId("issued-invite");
    await expect(issued.getByRole("heading")).toHaveText(inv.createdTitle.replace("{name}", fanName));
    const code = (await page.getByTestId("issued-code").textContent())!;
    expect(code).toMatch(CODE_FORMAT);
    await expect(page.getByTestId("issued-link")).toHaveText(`http://localhost:3100/invite/${code}`);

    // Copy buttons put the exact values on the clipboard.
    await page.getByRole("button", { name: inv.copyCode }).click();
    await expect(page.getByRole("button", { name: inv.copyCode })).toHaveText(en.common.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
    await page.getByRole("button", { name: inv.copyLink }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:3100/invite/${code}`);

    // The list shows the new invite, without its email or code.
    const row = page.getByRole("row").filter({ hasText: fanName });
    await expect(row).toContainText(inv.status.created);
    await expect(row).toContainText("E2E Admin");
    await expect(page.getByRole("table")).not.toContainText(fanEmail);
    await expect(page.getByRole("table")).not.toContainText(code);

    // A second open invite for the same email is refused.
    await page.getByLabel(inv.fanName).fill(fanName);
    await page.getByLabel(inv.email).fill(fanEmail.toUpperCase());
    await page.getByRole("button", { name: inv.create }).click();
    await expect(pageAlert(page)).toHaveText(inv.errors.emailHasOpenInvite);

    // Regenerate
    await row.getByRole("button", { name: inv.regenerateLabel.replace("{name}", fanName) }).click();
    await expect(issued.getByRole("heading")).toHaveText(inv.regeneratedTitle.replace("{name}", fanName));
    const newCode = (await page.getByTestId("issued-code").textContent())!;
    expect(newCode).toMatch(CODE_FORMAT);
    expect(newCode).not.toBe(code);

    // Revoke takes a confirmation, then the row loses its actions.
    await row.getByRole("button", { name: inv.revokeLabel.replace("{name}", fanName) }).click();
    await row.getByRole("button", { name: inv.cancel }).click();
    await expect(row).toContainText(inv.status.created);
    await row.getByRole("button", { name: inv.revokeLabel.replace("{name}", fanName) }).click();
    await row.getByRole("button", { name: inv.confirmRevoke }).click();
    await expect(row).toContainText(inv.status.revoked);
    await expect(row.getByRole("button")).toHaveCount(0);

    await expectNoHorizontalScroll(page);
  });

  test("a returning admin signs in with their authenticator app", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "slow: waits out the one-code-per-minute email limit");
    test.setTimeout(120_000);

    const email = await createAccount("admin", testInfo);
    const secret = await signInAsNewAdmin(page, "en", email);
    const firstUse = Date.now();

    await page.getByRole("button", { name: en.admin.signOut }).click();
    await expect(page).toHaveURL(/\/en\/sign-in$/);

    // Supabase sends at most one code per address per minute.
    await page.waitForTimeout(Math.max(0, firstUse + 61_000 - Date.now()));
    await page.locator("#email").fill(email);
    const since = Date.now();
    await page.locator("#email").press("Enter");
    await page.locator("#code").fill(await emailedCode(email, since));
    await page.locator("#code").press("Enter");

    await expect(page.getByRole("heading", { name: en.auth.mfaVerifyTitle })).toBeVisible();
    await expect(page.getByTestId("mfa-secret")).toHaveCount(0);
    await page.locator("#mfa-code").fill(totp(secret));
    await page.locator("#mfa-code").press("Enter");
    await expect(page).toHaveURL(/\/en\/admin\/invites$/);
  });
});

for (const { locale, dir, messages } of [
  { locale: "ko", dir: "ltr", messages: ko },
  { locale: "ar", dir: "rtl", messages: ar },
] as const) {
  test(`invites page in ${locale} (${dir})`, async ({ page }, testInfo) => {
    await signInAsNewAdmin(page, locale, await createAccount("admin", testInfo));
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.admin.invites.title);

    const fanName = `팬 ${Date.now()}`;
    await page.getByLabel(messages.admin.invites.fanName).fill(fanName);
    await page.getByLabel(messages.admin.invites.email).fill(`fan-${Date.now()}-${locale}-${testInfo.project.name}@fans.test`);
    await page.getByRole("button", { name: messages.admin.invites.create }).click();

    // Codes and links stay left-to-right inside an RTL page.
    const code = page.getByTestId("issued-code");
    await expect(code).toHaveText(CODE_FORMAT);
    await expect(code).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("row").filter({ hasText: fanName })).toContainText(
      messages.admin.invites.status.created,
    );
    await expectNoHorizontalScroll(page);
  });
}
