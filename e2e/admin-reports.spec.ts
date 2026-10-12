import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };
import { createUser, expectNoHorizontalScroll, hasLocalSupabase, signInAsNewAdmin } from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const audit = en.admin.audit;
const analytics = en.admin.analytics;

test("the audit log lists admin actions and can be filtered", async ({ page }, testInfo) => {
  const admin = await createUser("admin", testInfo, "approved", `Auditor ${randomUUID().slice(0, 6)}`);
  await signInAsNewAdmin(page, "en", admin.email);

  // Something to find: a new invite.
  const fanName = `Audited ${randomUUID().slice(0, 8)}`;
  await page.getByLabel(en.admin.invites.fanName).fill(fanName);
  await page.getByLabel(en.admin.invites.email).fill(`audited-${randomUUID().slice(0, 8)}@fans.test`);
  await page.getByRole("button", { name: en.admin.invites.create }).click();
  await expect(page.getByTestId("issued-code")).toBeVisible();

  await page.getByRole("link", { name: en.admin.nav.audit }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(audit.title);

  // Only this admin's invite actions, from today.
  await page.getByRole("combobox", { name: audit.filterAdmin }).selectOption({ value: admin.id });
  await page.getByRole("combobox", { name: audit.filterArea }).selectOption({ value: "invites" });
  await page.getByLabel(audit.from).fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: audit.filter }).click();
  await expect(page).toHaveURL(/area=invites/);
  const rows = page.getByRole("row").filter({ hasText: `${audit.areas.invites} · ${audit.actions.insert}` });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Auditor");

  // A date range with nothing in it.
  await page.getByLabel(audit.from).fill("2020-01-01");
  await page.getByLabel(audit.to).fill("2020-01-02");
  await page.getByRole("button", { name: audit.filter }).click();
  await expect(page.getByText(audit.empty)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("analytics shows the headline numbers", async ({ page }, testInfo) => {
  await signInAsNewAdmin(page, "en", (await createUser("admin", testInfo)).email);
  await page.getByRole("link", { name: en.admin.nav.analytics }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(analytics.title);
  for (const label of [analytics.invitesCreated, analytics.fansApproved, analytics.invitationsSent, analytics.responseVerification]) {
    await expect(page.getByRole("term").filter({ hasText: label })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: analytics.countriesTitle })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

for (const { locale, dir, messages } of [
  { locale: "ko", dir: "ltr", messages: ko },
  { locale: "ar", dir: "rtl", messages: ar },
] as const) {
  test(`audit log and analytics in ${locale} (${dir})`, async ({ page }, testInfo) => {
    await signInAsNewAdmin(page, locale, (await createUser("admin", testInfo)).email);
    await page.goto(`/${locale}/admin/audit`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.admin.audit.title);
    await expectNoHorizontalScroll(page);
    await page.goto(`/${locale}/admin/analytics`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.admin.analytics.title);
    await expect(page.getByRole("heading", { name: messages.admin.analytics.countriesTitle })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}
