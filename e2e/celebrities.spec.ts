import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };
import {
  createAccount,
  expectNoHorizontalScroll,
  hasLocalSupabase,
  pageAlert,
  serviceClient,
  signInAsNewAdmin,
  signInWithEmailCode,
} from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const c = en.admin.celebrities;
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), template);

test("an admin creates a celebrity with photo, translated bio and login", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const name = `Star ${testInfo.project.name} ${Date.now()}`;
  await signInAsNewAdmin(page, "en", await createAccount("admin", testInfo));

  // Create
  await page.getByRole("link", { name: en.admin.nav.celebrities }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
  await page.getByRole("link", { name: c.new }).click();
  await page.getByLabel(c.stageName).fill(name);
  await page.getByLabel(c.category).selectOption("actor");
  await page.getByLabel("日本語").check();
  await page.getByRole("button", { name: c.create }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  const profileId = page.url().split("/").pop()!;

  // Edit a field
  await page.getByLabel(c.groupName).fill("Demo Troupe");
  await page.getByRole("button", { name: c.saveProfile }).click();
  await expect(page.getByText(c.saved)).toBeVisible();

  // Photo: an iPhone HEIC, converted, cropped to a 3:4 photocard, published.
  await page.getByLabel(c.choosePhoto).setInputFiles("e2e/fixtures/photo.heic");
  await expect(page.getByRole("group", { name: en.register.cropArea })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: en.register.usePhoto }).click();
  await expect(page.getByRole("img", { name: fill(c.photoAlt, { name }) })).toBeVisible({ timeout: 20_000 });
  const db = serviceClient();
  const { data: profile } = await db.from("celebrity_profiles").select("photo_url, group_name").eq("id", profileId).single();
  expect(profile?.group_name).toBe("Demo Troupe");
  const photo = await sharp(Buffer.from(await (await fetch(profile!.photo_url!)).arrayBuffer())).metadata();
  expect(photo.width! * 4).toBe(photo.height! * 3);
  expect(photo.exif).toBeUndefined();

  // Bio in Korean, machine-translated into the other 12 languages.
  await page.getByRole("radio", { name: "한국어" }).check();
  await page.getByLabel(c.bioOriginal).fill("안녕하세요, 팬 여러분!");
  await page.getByRole("button", { name: c.saveBio }).click();
  await expect(page.getByText("Translated into 12 languages.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "English", exact: true })).toHaveValue("[EN-US] 안녕하세요, 팬 여러분!");
  await expect(page.getByRole("textbox", { name: "Português", exact: true })).toHaveValue("[PT-BR] 안녕하세요, 팬 여러분!");
  await expect(page.getByRole("textbox", { name: "中文", exact: true })).toHaveValue("[ZH-HANS] 안녕하세요, 팬 여러분!");

  // An admin's own wording for French is kept when the original changes.
  await page.getByRole("textbox", { name: "Français", exact: true }).fill("Bonjour à tous les fans !");
  await page.getByRole("button", { name: fill(c.saveTranslation, { language: "Français" }) }).click();
  await expect(page.getByText(c.badgeEdited, { exact: true })).toBeVisible();
  await page.getByLabel(c.bioOriginal).fill("반갑습니다!");
  await page.getByRole("button", { name: c.saveBio }).click();
  await expect(page.getByText("Translated into 11 languages.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "English", exact: true })).toHaveValue("[EN-US] 반갑습니다!");
  await expect(page.getByRole("textbox", { name: "Français", exact: true })).toHaveValue("Bonjour à tous les fans !");
  await expect(page.getByText(c.badgeOutdated, { exact: true })).toBeVisible();

  // Login account: created, linked, and the celebrity can sign in.
  const email = `e2e-celeb-${randomUUID().slice(0, 8)}@hallyustars.test`;
  await page.getByLabel(c.accountEmail).fill(email);
  await page.getByRole("button", { name: c.createAccount }).click();
  await expect(page.getByText(fill(c.accountLinked, { name }))).toBeVisible();

  const celebContext = await browser.newContext();
  const celebPage = await celebContext.newPage();
  await signInWithEmailCode(celebPage, "en", email);
  await expect(celebPage).toHaveURL(/\/en\/chats$/);
  await celebContext.close();

  const { data: audit } = await db
    .from("audit_logs")
    .select("action")
    .eq("action", "users.celebrity_account_created")
    .contains("metadata", { profile_id: profileId });
  expect(audit).toHaveLength(1);
});

test("a login email can only be used once", async ({ page }, testInfo) => {
  await signInAsNewAdmin(page, "en", await createAccount("admin", testInfo));
  const { data: profile } = await serviceClient()
    .from("celebrity_profiles")
    .insert({ stage_name: `Dup ${Date.now()}`, category: "singer" })
    .select("id")
    .single();
  await page.goto(`/en/admin/celebrities/${profile!.id}`);
  await page.getByLabel(c.accountEmail).fill("haneul@hallyustars.test");
  await page.getByRole("button", { name: c.createAccount }).click();
  await expect(pageAlert(page)).toHaveText(c.errors.emailInUse);
});

for (const { locale, dir, messages } of [
  { locale: "ko", dir: "ltr", messages: ko },
  { locale: "ar", dir: "rtl", messages: ar },
] as const) {
  test(`celebrity pages in ${locale} (${dir})`, async ({ page }, testInfo) => {
    await signInAsNewAdmin(page, locale, await createAccount("admin", testInfo));
    await page.goto(`/${locale}/admin/celebrities`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.admin.celebrities.title);
    await expectNoHorizontalScroll(page);
    await page.goto(`/${locale}/admin/celebrities/d0000000-0000-4000-8000-000000000001`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Haneul");
    await expectNoHorizontalScroll(page);
  });
}
