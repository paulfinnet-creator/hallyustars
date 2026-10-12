import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };
import { E2E_SEND_EMAIL_HOOK_SECRET, E2E_WEBHOOK_SECRET } from "./constants";
import {
  createUser,
  emailsTo,
  expectNoHorizontalScroll,
  hasLocalSupabase,
  pageAlert,
  serviceClient,
  setUpChat,
  signInWithEmailCode,
  waitForEmail,
} from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const MESSAGES = { en, ko, ar } as const;

async function emailOf(userId: string) {
  return (await serviceClient().auth.admin.getUserById(userId)).data.user!.email!;
}

for (const locale of ["en", "ko", "ar"] as const) {
  test(`an unread chat message is emailed, without its text (${locale})`, async ({ browser }, testInfo) => {
    test.setTimeout(90_000);
    const { star, fan, conversationId, fanPage, close } = await setUpChat(browser, testInfo);
    await serviceClient().from("users").update({ locale }).eq("id", star.userId);

    // The star is on their chat list, not in this chat.
    await fanPage.goto(`/en/chats/${conversationId}`);
    await fanPage.getByLabel(en.chat.messageLabel, { exact: true }).fill("Secret words for the star only");
    await fanPage.getByLabel(en.chat.messageLabel, { exact: true }).press("Enter");

    const subject = locale === "en" ? `New message from ${fan.name}` : locale === "ko" ? `${fan.name}님의 새 메시지` : `رسالة جديدة من ${fan.name}`;
    const email = await waitForEmail(await emailOf(star.userId), subject);
    expect(email.Text).not.toContain("Secret words");
    expect(email.HTML).not.toContain("Secret words");
    expect(email.HTML).toContain(`/${locale}/chats/${conversationId}`);
    expect(email.HTML).toContain(MESSAGES[locale].email.chat.openChat);
    if (locale === "ar") expect(email.HTML).toContain('dir="rtl"');
    expect(email.Headers["Reply-To"]?.[0]).toContain(`no-reply+${locale}@reply.hallyustars.org`);
    expect(email.Headers["List-Unsubscribe"]?.[0]).toMatch(/\/api\/unsubscribe\?token=/);
    expect(email.Headers["List-Unsubscribe-Post"]?.[0]).toBe("List-Unsubscribe=One-Click");

    const { data: log } = await serviceClient()
      .from("email_log")
      .select("type, status, message_count")
      .eq("user_id", star.userId);
    expect(log).toEqual([{ type: "chat_message", status: "sent", message_count: 1 }]);
    await close();
  });
}

test("no email while the other person has the chat open", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { star, conversationId, starPage, fanPage, close } = await setUpChat(browser, testInfo);
  await starPage.goto(`/en/chats/${conversationId}`);
  await fanPage.goto(`/en/chats/${conversationId}`);
  await expect(fanPage.getByText(en.chat.inChat)).toBeVisible();
  await fanPage.getByLabel(en.chat.messageLabel, { exact: true }).fill("Are you there?");
  await fanPage.getByLabel(en.chat.messageLabel, { exact: true }).press("Enter");
  await expect(starPage.getByRole("log")).toContainText("Are you there?");

  // Well past the 3-second test delay.
  await fanPage.waitForTimeout(8_000);
  // (The star's inbox only has their sign-in code.)
  const chatEmails = (await emailsTo(await emailOf(star.userId))).filter((m) => m.Subject.includes("new message") || m.Subject.startsWith("New message"));
  expect(chatEmails).toEqual([]);
  await close();
});

for (const locale of ["en", "ko", "ar"] as const) {
  test(`chat emails can be turned off in settings (${locale})`, async ({ page }, testInfo) => {
    const t = MESSAGES[locale].settings;
    const fan = await createUser("fan", testInfo);
    await signInWithEmailCode(page, locale, fan.email);
    await expect(page).toHaveURL(new RegExp(`/${locale}/celebrities$`));
    await page.getByRole("link", { name: MESSAGES[locale].member.settings }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.title);
    if (locale === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const toggle = page.getByRole("switch", { name: t.chatEmailsLabel });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(page.getByText(t.saved)).toBeVisible();
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expectNoHorizontalScroll(page);
  });
}

test("the unsubscribe link asks first, then turns chat emails off", async ({ page, request }, testInfo) => {
  const fan = await createUser("fan", testInfo);
  const db = serviceClient();
  const tokenOf = async () =>
    (await db.from("notification_preferences").select("unsubscribe_token, chat_emails_enabled").eq("user_id", fan.id).single()).data!;

  // Opening the link changes nothing (mail scanners open links).
  const { unsubscribe_token: token } = await tokenOf();
  await page.goto(`/ko/unsubscribe?token=${token}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ko.unsubscribe.title);
  expect((await tokenOf()).chat_emails_enabled).toBe(true);
  await page.getByRole("button", { name: ko.unsubscribe.confirm }).click();
  await expect(page.getByRole("status")).toHaveText(ko.unsubscribe.done);
  expect((await tokenOf()).chat_emails_enabled).toBe(false);

  await page.goto(`/en/unsubscribe?token=${randomUUID()}`);
  await page.getByRole("button", { name: en.unsubscribe.confirm }).click();
  await expect(pageAlert(page)).toHaveText(en.unsubscribe.invalid);

  // Mail apps' one-click unsubscribe (RFC 8058).
  await db.from("notification_preferences").update({ chat_emails_enabled: true }).eq("user_id", fan.id);
  const response = await request.post(`/api/unsubscribe?token=${token}`, { data: "List-Unsubscribe=One-Click" });
  expect(response.status()).toBe(204);
  expect((await tokenOf()).chat_emails_enabled).toBe(false);
});

test("replies to notifications get one automatic answer a day, in the tagged language", async ({ request }, testInfo) => {
  const sender = `reply-${testInfo.project.name}-${randomUUID().slice(0, 8)}@example.test`;
  const body = JSON.stringify({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: {
      email_id: randomUUID(),
      from: sender,
      to: ["no-reply+ko@reply.hallyustars.org"],
      subject: "Re: 새 메시지",
      message_id: `<${randomUUID()}@example.test>`,
    },
  });
  const post = (signed = true) => {
    const id = `msg_${randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(E2E_WEBHOOK_SECRET.replace("whsec_", ""), "base64");
    const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    return request.post("/api/email/inbound", {
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${signed ? signature : "bm90IHNpZ25lZA=="}`,
      },
      data: body,
    });
  };

  expect((await post(false)).status()).toBe(401);
  expect((await post()).status()).toBe(204);
  const answer = await waitForEmail(sender, ko.email.autoReply.subject);
  expect(answer.Headers["Auto-Submitted"]?.[0]).toBe("auto-replied");
  expect(answer.HTML).toContain("/ko/chats");

  // A second reply the same day gets no second answer.
  expect((await post()).status()).toBe(204);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  expect(await emailsTo(sender)).toHaveLength(1);
});

for (const locale of ["en", "ko", "ar"] as const) {
  test(`the sign-in code email is in the sign-in page's language (${locale})`, async ({ page }, testInfo) => {
    const fan = await createUser("fan", testInfo);
    // Saved language differs from the page's: the page wins.
    await serviceClient().from("users").update({ locale: locale === "en" ? "ko" : "en" }).eq("id", fan.id);
    await signInWithEmailCode(page, locale, fan.email);
    await expect(page).toHaveURL(new RegExp(`/${locale}/celebrities$`));

    const email = await waitForEmail(fan.email, MESSAGES[locale].email.signIn.subject);
    expect(email.Text).toMatch(/\b\d{6}\b/);
    expect(email.HTML).toContain(`lang="${locale}"`);
    if (locale === "ar") expect(email.HTML).toContain('dir="rtl"');
    expect(email.Headers["Reply-To"]?.[0]).toContain(`no-reply+${locale}@reply.hallyustars.org`);
  });
}

test("the Send Email Hook checks its signature and falls back to the saved language", async ({ request }, testInfo) => {
  const fan = await createUser("fan", testInfo);
  await serviceClient().from("users").update({ locale: "ar" }).eq("id", fan.id);
  const body = JSON.stringify({
    user: { id: fan.id, email: fan.email },
    email_data: { token: "123456", token_hash: "x", redirect_to: "", email_action_type: "magiclink", site_url: "" },
  });
  const post = (signed = true) => {
    const id = `msg_${randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(E2E_SEND_EMAIL_HOOK_SECRET.replace("v1,whsec_", ""), "base64");
    const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    return request.post("/api/auth/send-email", {
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signed ? signature : "bm90IHNpZ25lZA=="}`,
      },
      data: body,
    });
  };

  expect((await post(false)).status()).toBe(401);
  expect((await emailsTo(fan.email)).filter((m) => m.Subject === ar.email.signIn.subject)).toEqual([]);
  expect((await post()).status()).toBe(200);
  const email = await waitForEmail(fan.email, ar.email.signIn.subject);
  expect(email.Text).toContain("123456");
  expect(email.HTML).toContain('dir="rtl"');
});
