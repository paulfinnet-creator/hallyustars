import { expect, test } from "@playwright/test";
import sharp from "sharp";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };
import { createInvite, emailedCode, expectNoHorizontalScroll, hasLocalSupabase, pageAlert, serviceClient } from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

// Invite lookups are rate-limited per IP; give each test its own address so
// repeated runs don't trip the limit (see src/lib/rate-limit.ts).
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${rand()}.${rand()}.${rand()}` });
});

function rand() {
  return Math.floor(Math.random() * 250) + 1;
}

const inv = en.invite;
const reg = en.register;
const HEIC = "e2e/fixtures/photo.heic";

/** A JPG with GPS coordinates in its EXIF, like a phone photo. */
function phoneJpeg(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#1f4e79" } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestPhone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 33/1 0/1" } })
    .toBuffer();
}

test("a fan registers from an invite link", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const { email, code } = await createInvite(testInfo, "Ada Test");

  // Invite link pre-fills the code.
  await page.goto(`/en/invite/${code}`);
  await expect(page.getByLabel(inv.codeLabel)).toHaveValue(code);
  await page.getByRole("button", { name: inv.continue }).click();

  // Wrong email is refused with the spec's message; the right one in other case works.
  await page.getByLabel(inv.emailLabel).fill("someone-else@fans.test");
  await page.getByRole("button", { name: inv.sendCode }).click();
  await expect(pageAlert(page)).toHaveText(inv.errors.mismatch);
  await page.getByLabel(inv.emailLabel).fill(email.toUpperCase());
  const since = Date.now();
  await page.getByRole("button", { name: inv.sendCode }).click();
  await page.locator("#code").fill(await emailedCode(email, since));
  await page.locator("#code").press("Enter");
  await expect(page).toHaveURL(/\/en\/register$/);
  await expect(page.getByRole("heading", { name: reg.photoTitle })).toBeVisible();

  // Not a photo.
  await page.getByLabel(reg.choosePhoto).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(pageAlert(page)).toHaveText(reg.errors.wrongType);

  // HEIC profile photo: converted on the server, then cropped in the browser.
  await page.getByLabel(reg.choosePhoto).setInputFiles(HEIC);
  const cropArea = page.getByRole("group", { name: reg.cropArea });
  await expect(cropArea).toBeVisible({ timeout: 20_000 });
  await cropArea.focus();
  await page.keyboard.press("ArrowDown");
  await page.getByLabel(reg.zoom).fill("1.5");
  await page.getByRole("button", { name: reg.usePhoto }).click();
  await expect(page.getByRole("img", { name: reg.yourPhoto })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: reg.continue }).click();

  // Leaving and coming back resumes at the ID step.
  await page.reload();
  await expect(page.getByRole("heading", { name: reg.idTitle })).toBeVisible();

  // ID: the document type comes first.
  await page.getByLabel(reg.chooseId).setInputFiles({ name: "id.jpg", mimeType: "image/jpeg", buffer: await phoneJpeg(2400, 1600) });
  await expect(pageAlert(page)).toHaveText(reg.errors.chooseIdType);
  await page.getByLabel(reg.idTypes.passport).check();
  await page.getByLabel(reg.chooseId).setInputFiles({ name: "id.jpg", mimeType: "image/jpeg", buffer: await phoneJpeg(2400, 1600) });
  await expect(page.getByRole("img", { name: reg.yourId })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: reg.continue }).click();

  await expect(page.getByRole("heading", { name: reg.reviewTitle })).toBeVisible();
  await page.getByRole("button", { name: reg.submit }).click();
  await expect(page.getByRole("heading", { name: reg.pendingTitle })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // What was stored: a verification for review, clean JPGs, no leftovers.
  const db = serviceClient();
  const { data: invite } = await db.from("invites").select("status, user_id").ilike("email", email).single();
  expect(invite?.status).toBe("pending_review");
  const { data: verification } = await db
    .from("verifications")
    .select("status, id_document_type, profile_photo_path, id_document_path")
    .eq("user_id", invite!.user_id!)
    .single();
  expect(verification).toMatchObject({ status: "pending", id_document_type: "passport" });

  const storage = db.storage.from("id-documents");
  const fileMeta = async (path: string) =>
    sharp(Buffer.from(await (await storage.download(path)).data!.arrayBuffer())).metadata();
  const photo = await fileMeta(verification!.profile_photo_path);
  const thumb = await fileMeta(verification!.profile_photo_path.replace(/\.jpg$/, "-400.jpg"));
  const id = await fileMeta(verification!.id_document_path!);
  expect(photo.format).toBe("jpeg");
  expect(photo.width).toBe(photo.height);
  expect([thumb.width, thumb.height]).toEqual([400, 400]);
  expect(Math.max(id.width!, id.height!)).toBe(2000);
  for (const meta of [photo, thumb, id]) expect(meta.exif).toBeUndefined();
  const { data: leftovers } = await storage.list(`${invite!.user_id}/uploads`);
  expect(leftovers ?? []).toHaveLength(0);

  // The same code can't start a second registration.
  await page.goto("/en/invite");
  await page.getByLabel(inv.codeLabel).fill(code.toLowerCase());
  await page.getByRole("button", { name: inv.continue }).click();
  await expect(pageAlert(page)).toHaveText(inv.errors.used);
});

test("unknown codes and repeated wrong emails", async ({ page }, testInfo) => {
  await page.goto("/en/invite");
  await page.getByLabel(inv.codeLabel).fill("SKCE-2345-6789");
  await page.getByRole("button", { name: inv.continue }).click();
  await expect(pageAlert(page)).toHaveText(inv.errors.unknown);

  const { code } = await createInvite(testInfo);
  await page.getByLabel(inv.codeLabel).fill(code.replace("SKCE-", "").replace("-", " "));
  await page.getByRole("button", { name: inv.continue }).click();
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.getByLabel(inv.emailLabel).fill(`wrong${attempt}@fans.test`);
    await page.getByRole("button", { name: inv.sendCode }).click();
    await expect(pageAlert(page)).toHaveText(inv.errors.mismatch);
  }
  await page.getByLabel(inv.emailLabel).fill("wrong5@fans.test");
  await page.getByRole("button", { name: inv.sendCode }).click();
  await expect(pageAlert(page)).toHaveText(inv.errors.locked);
});

for (const { locale, dir, messages } of [
  { locale: "ko", dir: "ltr", messages: ko },
  { locale: "ar", dir: "rtl", messages: ar },
] as const) {
  test(`invite page in ${locale} (${dir})`, async ({ page }, testInfo) => {
    const { code } = await createInvite(testInfo);
    await page.goto(`/${locale}/invite/${code}`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.invite.title);
    // Codes stay left-to-right in Arabic.
    await expect(page.getByLabel(messages.invite.codeLabel)).toHaveAttribute("dir", "ltr");
    await page.getByRole("button", { name: messages.invite.continue }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.invite.emailTitle);
    await expectNoHorizontalScroll(page);
  });
}

test("guessing codes is rate-limited", async ({ page }) => {
  await page.goto("/en/invite");
  for (let attempt = 1; attempt <= 20; attempt++) {
    await page.getByLabel(inv.codeLabel).fill(`SKCE-2345-${String(6700 + attempt).replace(/[01]/g, "9")}`);
    await page.getByRole("button", { name: inv.continue }).click();
    await expect(pageAlert(page)).toHaveText(inv.errors.unknown);
  }
  await page.getByLabel(inv.codeLabel).fill("SKCE-2345-6789");
  await page.getByRole("button", { name: inv.continue }).click();
  await expect(pageAlert(page)).toHaveText(inv.errors.rateLimited);
});
