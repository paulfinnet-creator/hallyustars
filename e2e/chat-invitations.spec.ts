import { expect, test, type Page } from "@playwright/test";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };
import {
  createOpenCelebrity,
  createUser,
  expectNoHorizontalScroll,
  hasLocalSupabase,
  pageAlert,
  serviceClient,
  signInAsNewAdmin,
  signInWithEmailCode,
  waitForEmail,
} from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const f = en.invitations;
const a = en.admin.chatInvitations;
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);

async function sendFromProfile(page: Page, celebrityId: string, name: string, message: string) {
  await page.goto(`/en/celebrities/${celebrityId}`);
  await expect(page.getByRole("heading", { name: fill(f.inviteTitle, { name }) })).toBeVisible();
  await page.getByLabel(fill(f.messageLabel, { name })).fill(message);
  await page.getByRole("button", { name: f.send }).click();
  await expect(page.getByText(fill(f.waitingOnProfile, { name }))).toBeVisible();
}

/** Sign in as an approved fan and wait until the session is set. */
async function signInFan(page: Page, locale: string, email: string) {
  await signInWithEmailCode(page, locale, email);
  await expect(page).toHaveURL(new RegExp(`/${locale}/celebrities$`));
}

/** The queue card for one star (each test uses its own star). */
const queueCard = (page: Page, name: string) => page.getByRole("main").getByRole("listitem").filter({ hasText: name });

test("a fan invites a star; an admin rejects, then approves", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const star = await createOpenCelebrity(testInfo);
  const fan = await createUser("fan", testInfo, "approved", `Fan ${star.name}`);

  // Fan sends an invitation from the profile page.
  await signInFan(page, "en", fan.email);
  await sendFromProfile(page, star.id, star.name, "Hello! Your songs got me through exams.");

  // A second one can't be sent while the first is waiting.
  await expect(page.getByLabel(fill(f.messageLabel, { name: star.name }))).toHaveCount(0);

  // Admin rejects it with a reason.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminAccount = await createUser("admin", testInfo);
  await signInAsNewAdmin(admin, "en", adminAccount.email);
  await admin.getByRole("link", { name: new RegExp(`^${en.admin.nav.chatInvitations}`) }).click();
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText(a.title);
  const card = queueCard(admin, star.name);
  await expect(card).toContainText("Hello! Your songs got me through exams.");
  await expect(card).toContainText(`Fan ${star.name}`);
  await expect(card).not.toContainText(fan.email);
  await card.getByRole("button", { name: fill(a.rejectLabel, { fan: `Fan ${star.name}`, celebrity: star.name }) }).click();
  await card.getByLabel(a.reasonLabel).fill(`${star.name} is on tour this month.`);
  await card.getByRole("button", { name: a.confirmReject }).click();
  await expect(queueCard(admin, star.name)).toHaveCount(0);

  await admin.getByRole("link", { name: a.viewHistory }).click();
  await expect(queueCard(admin, star.name)).toContainText(a.status.rejected);
  await expect(queueCard(admin, star.name)).toContainText(`${star.name} is on tour this month.`);

  // The fan sees the reason and may try again.
  await page.reload();
  await expect(page.getByText(f.previous.rejected)).toBeVisible();
  await expect(page.getByText(`${star.name} is on tour this month.`)).toBeVisible();
  await sendFromProfile(page, star.id, star.name, "Hope the tour went well!");

  // Admin approves: the conversation is created.
  await admin.goto("/en/admin/chat-invitations");
  await queueCard(admin, star.name)
    .getByRole("button", { name: fill(a.approveLabel, { fan: `Fan ${star.name}`, celebrity: star.name }) })
    .click();
  await expect(queueCard(admin, star.name)).toHaveCount(0);
  await adminContext.close();

  // Both decisions were emailed to the fan; the rejection gives the reason.
  const rejectedEmail = await waitForEmail(fan.email, `Your chat invitation to ${star.name} wasn't approved`);
  expect(rejectedEmail.Text).toContain(`${star.name} is on tour this month.`);
  const approvedEmail = await waitForEmail(fan.email, `Your chat invitation to ${star.name} was approved`);
  expect(approvedEmail.HTML).toMatch(/\/en\/chats\/[0-9a-f-]{36}/);

  await page.reload();
  await expect(page.getByText(fill(f.approvedOnProfile, { name: star.name }))).toBeVisible();
  await page.getByRole("link", { name: f.myInvitations }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(f.title);
  await expect(page.getByRole("img", { name: f.status.approved })).toBeVisible();
  await expect(page.getByText(f.status.rejected)).toBeVisible();

  const db = serviceClient();
  const { data: invitations } = await db
    .from("chat_invitations")
    .select("id")
    .eq("celebrity_id", star.id)
    .eq("status", "approved");
  expect(invitations).toHaveLength(1);
  const { data: conversation } = await db
    .from("conversations")
    .select("id")
    .eq("chat_invitation_id", invitations![0]!.id)
    .single();
  const { data: members } = await db.from("conversation_members").select("user_id").eq("conversation_id", conversation!.id);
  expect(members!.map((m: { user_id: string }) => m.user_id).sort()).toEqual([fan.id, star.userId].sort());
  const { data: audit } = await db
    .from("audit_logs")
    .select("action")
    .eq("admin_id", adminAccount.id)
    .eq("action", "chat_invitations.update");
  expect(audit).toHaveLength(2);
});

test("a fan withdraws a waiting invitation", async ({ page }, testInfo) => {
  const star = await createOpenCelebrity(testInfo);
  await signInFan(page, "en", (await createUser("fan", testInfo)).email);
  await sendFromProfile(page, star.id, star.name, "Hi there!");

  await page.getByRole("link", { name: en.member.invitations }).click();
  const item = page.getByRole("main").getByRole("listitem").filter({ hasText: star.name });
  await expect(item).toContainText(f.status.pending);
  await item.getByRole("button", { name: f.withdraw }).click();
  await expect(item).toContainText(f.status.withdrawn);
  await expect(item.getByRole("button", { name: f.withdraw })).toHaveCount(0);

  await page.goto(`/en/celebrities/${star.id}`);
  await expect(page.getByText(f.previous.withdrawn)).toBeVisible();
});

test("an expired invitation can be replaced", async ({ page }, testInfo) => {
  const star = await createOpenCelebrity(testInfo);
  const fan = await createUser("fan", testInfo);
  const { error } = await serviceClient().from("chat_invitations").insert({
    fan_id: fan.id,
    celebrity_id: star.id,
    message: "Old message",
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });
  if (error) throw error;

  await signInFan(page, "en", fan.email);
  await page.goto("/en/invitations");
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: star.name })).toContainText(f.status.expired);

  await page.goto(`/en/celebrities/${star.id}`);
  await expect(page.getByText(f.previous.expired)).toBeVisible();
  await sendFromProfile(page, star.id, star.name, "Trying again!");
});

test("stars who aren't open show no invitation form", async ({ page }, testInfo) => {
  await signInFan(page, "en", (await createUser("fan", testInfo)).email);
  // A star without a login account can't be invited yet.
  const { data } = await serviceClient()
    .from("celebrity_profiles")
    .insert({ stage_name: `Closed ${Date.now()}`, category: "actor" })
    .select("id")
    .single();
  await page.goto(`/en/celebrities/${data!.id}`);
  await expect(page.getByText(en.discover.invitesClosed)).toBeVisible();
  await expect(page.getByRole("button", { name: f.send })).toHaveCount(0);
});

test("the message length is limited", async ({ page }, testInfo) => {
  const star = await createOpenCelebrity(testInfo);
  await signInFan(page, "en", (await createUser("fan", testInfo)).email);
  await page.goto(`/en/celebrities/${star.id}`);
  const box = page.getByLabel(fill(f.messageLabel, { name: star.name }));
  await box.fill("x".repeat(600));
  await expect(box).toHaveValue("x".repeat(500));
  await expect(page.getByText("500/500")).toBeVisible();
  await expect(pageAlert(page)).toHaveCount(0);
});

for (const { locale, dir, messages } of [
  { locale: "ko", dir: "ltr", messages: ko },
  { locale: "ar", dir: "rtl", messages: ar },
] as const) {
  test(`invitation pages in ${locale} (${dir})`, async ({ page, browser }, testInfo) => {
    test.setTimeout(90_000);
    const star = await createOpenCelebrity(testInfo);
    const fan = await createUser("fan", testInfo);
    await serviceClient().from("chat_invitations").insert({ fan_id: fan.id, celebrity_id: star.id, message: "안녕하세요!" });

    await signInFan(page, locale, fan.email);
    await page.goto(`/${locale}/invitations`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.invitations.title);
    await expectNoHorizontalScroll(page);
    await page.goto(`/${locale}/celebrities/${star.id}`);
    await expect(page.getByText(fill(messages.invitations.waitingOnProfile, { name: star.name }))).toBeVisible();
    await expectNoHorizontalScroll(page);

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signInAsNewAdmin(admin, locale, (await createUser("admin", testInfo)).email);
    await admin.goto(`/${locale}/admin/chat-invitations`);
    await expect(admin.getByRole("heading", { level: 1 })).toHaveText(messages.admin.chatInvitations.title);
    await expect(queueCard(admin, star.name)).toBeVisible();
    await expectNoHorizontalScroll(admin);
    await adminContext.close();
  });
}
