import { randomUUID } from "node:crypto";
import { expect, test, type TestInfo } from "@playwright/test";
import sharp from "sharp";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };
import {
  createAccount,
  createPendingFan,
  expectNoHorizontalScroll,
  hasLocalSupabase,
  serviceClient,
  signInAsNewAdmin,
  signInWithEmailCode,
} from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const p = en.settings.photo;
const v = en.admin.verifications;
const fill = (template: string, name: string) => template.replace("{name}", name);

/** An approved fan with a published photo (their registration ID is still kept). */
async function approvedFan(testInfo: TestInfo, name: string) {
  const fan = await createPendingFan(testInfo, name);
  const db = serviceClient();
  const avatarPath = `${fan.userId}/${randomUUID()}.jpg`;
  const avatar = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#b83a2b" } }).jpeg().toBuffer();
  await db.storage.from("avatars").upload(avatarPath, avatar, { contentType: "image/jpeg" });
  const avatarUrl = db.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl;
  await db
    .from("verifications")
    .update({ status: "approved", reviewed_by: "a0000000-0000-4000-8000-000000000001", decided_at: new Date().toISOString() })
    .eq("id", fan.verificationId);
  await db.from("users").update({ status: "approved", avatar_url: avatarUrl }).eq("id", fan.userId);
  const email = (await db.auth.admin.getUserById(fan.userId)).data.user!.email!;
  return { ...fan, email, avatarPath, avatarUrl };
}

test("a fan's new photo is reviewed before it replaces the old one", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const name = `Photo Fan ${testInfo.project.name}-${randomUUID().slice(0, 6)}`;
  const fan = await approvedFan(testInfo, name);
  const db = serviceClient();

  // The fan chooses and crops a new photo in Settings.
  await signInWithEmailCode(page, "en", fan.email);
  await expect(page).toHaveURL(/\/en\/celebrities$/);
  await page.getByRole("link", { name: en.member.settings }).click();
  await expect(page.getByRole("heading", { name: p.title })).toBeVisible();
  await expect(page.getByRole("img", { name: p.current })).toHaveAttribute("src", fan.avatarUrl);
  const photo = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#1f4e79" } }).jpeg().toBuffer();
  await page.getByLabel(p.choose).setInputFiles({ name: "new.jpg", mimeType: "image/jpeg", buffer: photo });
  await page.getByRole("button", { name: en.register.usePhoto }).click();
  await expect(page.getByRole("status")).toHaveText(p.sent, { timeout: 20_000 });
  await expect(page.getByRole("img", { name: p.new })).toBeVisible();

  // Still the old photo for everyone else until an admin approves.
  const { data: before } = await db.from("users").select("status, avatar_url").eq("id", fan.userId).single();
  expect(before).toEqual({ status: "approved", avatar_url: fan.avatarUrl });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText(p.waiting);

  // The admin compares the new photo with the current one and the ID.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsNewAdmin(admin, "en", await createAccount("admin", testInfo));
  await admin.getByRole("link", { name: en.admin.nav.verifications }).click();
  const row = admin.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText(v.kinds.profile_photo_change);
  await row.getByRole("link", { name: fill(v.reviewLabel, name) }).click();
  await expect(admin.getByText(v.photoChangeHint)).toBeVisible();
  await expect(admin.getByRole("img", { name: fill(v.profilePhotoAlt, name) })).toBeVisible();
  await expect(admin.getByRole("img", { name: fill(v.currentPhotoAlt, name) })).toHaveAttribute("src", fan.avatarUrl);
  await expect(admin.getByRole("img", { name: fill(v.idDocumentAlt, name) })).toBeVisible();
  await admin.getByRole("button", { name: v.approve, exact: true }).click();
  await admin.getByRole("button", { name: fill(v.confirmApprove, name) }).click();
  // On to the next review (if any): this one is decided.
  await expect
    .poll(async () => {
      const { data } = await db
        .from("verifications")
        .select("status")
        .eq("user_id", fan.userId)
        .eq("kind", "profile_photo_change")
        .single();
      return data?.status;
    })
    .toBe("approved");
  await adminContext.close();

  // The new photo is live and the old public file is gone.
  const { data: after } = await db.from("users").select("status, avatar_url").eq("id", fan.userId).single();
  expect(after!.status).toBe("approved");
  expect(after!.avatar_url).not.toBe(fan.avatarUrl);
  const { data: files } = await db.storage.from("avatars").list(fan.userId);
  expect(files!.map((f) => `${fan.userId}/${f.name}`)).not.toContain(fan.avatarPath);
  await page.reload();
  await expect(page.getByRole("img", { name: p.current })).toHaveAttribute("src", after!.avatar_url!);
  await expect(page.getByRole("img", { name: p.new })).toHaveCount(0);
});

for (const { locale, dir, messages } of [
  { locale: "ko", dir: "ltr", messages: ko },
  { locale: "ar", dir: "rtl", messages: ar },
] as const) {
  test(`the photo section in ${locale} (${dir})`, async ({ page }, testInfo) => {
    const fan = await approvedFan(testInfo, `사진 ${randomUUID().slice(0, 6)}`);
    await signInWithEmailCode(page, locale, fan.email);
    await expect(page).toHaveURL(new RegExp(`/${locale}/celebrities$`));
    await page.goto(`/${locale}/settings`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { name: messages.settings.photo.title })).toBeVisible();
    await expect(page.getByText(messages.settings.photo.choose)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}
