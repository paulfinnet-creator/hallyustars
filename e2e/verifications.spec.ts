import { expect, test } from "@playwright/test";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };
import {
  createAccount,
  createPendingFan,
  expectNoHorizontalScroll,
  hasLocalSupabase,
  pageAlert,
  serviceClient,
  signInAsNewAdmin,
  signInWithEmailCode,
} from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const v = en.admin.verifications;
const fill = (template: string, name: string) => template.replace("{name}", name);

test("an admin approves one fan and rejects another", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const tag = `${testInfo.project.name}-${Date.now()}`;
  const approveName = `Approve Me ${tag}`;
  const rejectName = `Reject Me ${tag}`;
  const toApprove = await createPendingFan(testInfo, approveName);
  const toReject = await createPendingFan(testInfo, rejectName);
  const db = serviceClient();

  await signInAsNewAdmin(page, "en", await createAccount("admin", testInfo));

  // Queue: both fans listed, with a count in the navigation.
  await page.getByRole("link", { name: en.admin.nav.verifications }).click();
  await expect(page).toHaveURL(/\/en\/admin\/verifications$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(v.title);
  await expect(page.getByRole("row").filter({ hasText: approveName })).toContainText(v.kinds.registration);
  await expect(page.getByRole("row").filter({ hasText: rejectName })).toBeVisible();
  // The queue itself shows no images, so nothing has been logged yet.
  await expect(page.getByRole("img")).toHaveCount(0);
  const idViews = async (verificationId: string) =>
    (await db.from("audit_logs").select("id", { count: "exact", head: true })
      .eq("action", "verification.id_viewed").eq("target_id", verificationId)).count;
  expect(await idViews(toApprove.verificationId)).toBe(0);

  // Review: photo and ID side by side; opening the ID is logged once.
  await page.getByRole("link", { name: fill(v.reviewLabel, approveName) }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(fill(v.reviewTitle, approveName));
  await expect(page.getByRole("img", { name: fill(v.profilePhotoAlt, approveName) })).toBeVisible();
  const idImage = page.getByRole("img", { name: fill(v.idDocumentAlt, approveName) });
  await expect(idImage).toBeVisible();
  expect(await idImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => idViews(toApprove.verificationId)).toBe(1);

  // Approve takes a confirmation.
  await page.getByRole("button", { name: v.approve, exact: true }).click();
  await page.getByRole("button", { name: fill(v.confirmApprove, approveName) }).click();
  await expect(page).not.toHaveURL(new RegExp(toApprove.verificationId));

  const { data: approved } = await db.from("users").select("status, avatar_url").eq("id", toApprove.userId).single();
  expect(approved?.status).toBe("approved");
  const avatar = await fetch(approved!.avatar_url!);
  expect(avatar.status).toBe(200);
  expect(avatar.headers.get("content-type")).toBe("image/jpeg");
  const { data: approvedInvite } = await db.from("invites").select("status").eq("user_id", toApprove.userId).single();
  expect(approvedInvite?.status).toBe("approved");

  // Reject needs a reason, which the fan will see.
  await page.goto(`/en/admin/verifications/${toReject.verificationId}`);
  await page.getByRole("button", { name: v.reject, exact: true }).click();
  await expect(pageAlert(page)).toHaveText(v.errors.reasonRequired);
  await page.getByLabel(v.rejectReason).fill("The ID photo is too blurry to read.");
  await page.getByRole("button", { name: v.reject, exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(toReject.verificationId));
  const { data: rejected } = await db.from("users").select("status, avatar_url").eq("id", toReject.userId).single();
  expect(rejected).toEqual({ status: "rejected", avatar_url: null });

  // A decided review can't be decided again.
  await page.goto(`/en/admin/verifications/${toReject.verificationId}`);
  await expect(page.getByText(v.alreadyDecided)).toBeVisible();
  await expect(page.getByRole("button", { name: v.approve, exact: true })).toHaveCount(0);

  // The rejected fan sees the reason when signing in.
  const fanContext = await browser.newContext();
  const fanPage = await fanContext.newPage();
  await signInWithEmailCode(fanPage, "en", toReject.email);
  await expect(fanPage).toHaveURL(/\/en\/register$/);
  await expect(fanPage.getByRole("heading", { name: en.register.rejectedTitle })).toBeVisible();
  await expect(fanPage.getByText("The ID photo is too blurry to read.")).toBeVisible();
  await fanContext.close();
});

for (const { locale, dir, messages } of [
  { locale: "ko", dir: "ltr", messages: ko },
  { locale: "ar", dir: "rtl", messages: ar },
] as const) {
  test(`review page in ${locale} (${dir})`, async ({ page }, testInfo) => {
    const name = `Fan ${locale} ${testInfo.project.name} ${Date.now()}`;
    const { verificationId } = await createPendingFan(testInfo, name);
    await signInAsNewAdmin(page, locale, await createAccount("admin", testInfo));

    await page.goto(`/${locale}/admin/verifications`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.admin.verifications.title);
    await expectNoHorizontalScroll(page);

    await page.goto(`/${locale}/admin/verifications/${verificationId}`);
    await expect(page.getByRole("img", { name: messages.admin.verifications.idDocumentAlt.replace("{name}", name) })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}
