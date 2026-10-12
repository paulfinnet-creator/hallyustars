import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };
import {
  createAccount,
  createUser,
  expectNoHorizontalScroll,
  hasLocalSupabase,
  pageAlert,
  serviceClient,
  signInAsNewAdmin,
} from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const s = en.admin.settings;
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [k, v]) => text.replaceAll(`{${k}}`, String(v)), template);

async function openSettings(page: Page, messages: typeof en) {
  await page.getByRole("link", { name: messages.admin.nav.settings }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.admin.settings.title);
}

const adminItem = (page: Page, name: string) => page.getByRole("main").getByRole("listitem").filter({ hasText: name });

test("admins add another admin, reset their authenticator and remove their access", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const actor = await createUser("admin", testInfo);
  await signInAsNewAdmin(page, "en", actor.email);
  await openSettings(page, en);

  // Add a new admin.
  const name = `Admin ${randomUUID().slice(0, 8)}`;
  const email = `e2e-new-admin-${testInfo.project.name}-${randomUUID().slice(0, 8)}@hallyustars.test`;
  await page.getByLabel(s.name).fill(name);
  await page.getByLabel(s.email).fill(email);
  await page.getByRole("button", { name: s.add, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(fill(s.added, { name }));
  await expect(adminItem(page, name)).toContainText(s.authenticatorNotSet);

  // The same email can't be added twice.
  await page.getByLabel(s.name).fill(name);
  await page.getByLabel(s.email).fill(email);
  await page.getByRole("button", { name: s.add, exact: true }).click();
  await expect(pageAlert(page)).toHaveText(s.errors.emailInUse);

  // The new admin signs in and sets up their authenticator app.
  const newContext = await browser.newContext();
  const newAdmin = await newContext.newPage();
  await signInAsNewAdmin(newAdmin, "en", email);
  await page.reload();
  await expect(adminItem(page, name)).toContainText(s.authenticatorSet);

  // Lost phone: reset their authenticator. They are signed out at once.
  await adminItem(page, name).getByRole("button", { name: fill(s.resetLabel, { name }) }).click();
  await adminItem(page, name).getByRole("button", { name: s.confirmReset }).click();
  await expect(page.getByRole("status")).toHaveText(fill(s.resetNotice, { name }));
  await expect(adminItem(page, name)).toContainText(s.authenticatorNotSet);
  await newAdmin.goto("/en/admin/invites");
  await expect(newAdmin).toHaveURL(/\/en\/sign-in$/);
  await newContext.close();

  // Remove their access, then give it back.
  await adminItem(page, name).getByRole("button", { name: fill(s.removeLabel, { name }) }).click();
  await adminItem(page, name).getByRole("button", { name: s.confirmRemove }).click();
  await expect(page.getByRole("status")).toHaveText(fill(s.removedNotice, { name }));
  await expect(adminItem(page, name)).toContainText(s.removed);
  await adminItem(page, name).getByRole("button", { name: fill(s.restoreLabel, { name }) }).click();
  await expect(page.getByRole("status")).toHaveText(fill(s.restoredNotice, { name }));

  // Nobody can remove or reset themselves.
  await expect(adminItem(page, en.admin.settings.you).getByRole("button")).toHaveCount(0);

  const db = serviceClient();
  const { data: created } = await db.from("users").select("id, role").eq("display_name", name).single();
  expect(created!.role).toBe("admin");
  const { data: audit } = await db
    .from("audit_logs")
    .select("action")
    .eq("target_id", created!.id)
    .eq("admin_id", actor.id)
    .order("id");
  expect(audit!.map((row: { action: string }) => row.action)).toEqual([
    "users.admin_created",
    "users.mfa_reset",
    "users.update",
    "users.update",
  ]);
});

test("platform settings are saved and audited", async ({ page }, testInfo) => {
  await signInAsNewAdmin(page, "en", await createAccount("admin", testInfo));
  await openSettings(page, en);
  const field = page.getByLabel(s.fields.chat_invitation_expiry_days);
  await expect(field).toHaveValue("14");
  await expectNoHorizontalScroll(page);
  // Settings are shared by every test running at the same time: only one
  // project changes one, and puts it back.
  test.skip(testInfo.project.name !== "desktop", "changes shared settings");

  await field.fill("15");
  await page.getByRole("button", { name: s.save }).click();
  await expect(page.getByRole("status")).toHaveText(s.saved);
  await page.reload();
  await expect(field).toHaveValue("15");
  await field.fill("14");
  await page.getByRole("button", { name: s.save }).click();
  await expect(page.getByRole("status")).toHaveText(s.saved);

  const { data: audit } = await serviceClient()
    .from("audit_logs")
    .select("action")
    .eq("target_id", "chat_invitation_expiry_days")
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  expect(audit!.length).toBeGreaterThanOrEqual(2);
});

for (const { locale, dir, messages } of [
  { locale: "ko", dir: "ltr", messages: ko },
  { locale: "ar", dir: "rtl", messages: ar },
] as const) {
  test(`settings page in ${locale} (${dir})`, async ({ page }, testInfo) => {
    await signInAsNewAdmin(page, locale, await createAccount("admin", testInfo));
    await openSettings(page, messages);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { name: messages.admin.settings.platformTitle })).toBeVisible();
    await expect(page.getByLabel(messages.admin.settings.fields.invite_expiry_days)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}
