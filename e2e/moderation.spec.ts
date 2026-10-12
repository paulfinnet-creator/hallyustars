import { expect, test, type Page } from "@playwright/test";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import {
  createUser,
  expectNoHorizontalScroll,
  hasLocalSupabase,
  pageAlert,
  serviceClient,
  setUpChat,
  signInAsNewAdmin,
} from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const c = en.chat;
const s = en.chat.safety;
const m = en.admin.moderation;
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), template);

const log = (page: Page) => page.getByRole("log");
const composer = (page: Page) => page.getByLabel(c.messageLabel, { exact: true });

async function sendText(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

test("messages are translated into the reader's language", async ({ browser }, testInfo) => {
  const { conversationId, starPage, fanPage, close } = await setUpChat(browser, testInfo);
  await starPage.goto(`/en/chats/${conversationId}`);
  await fanPage.goto(`/en/chats/${conversationId}`);

  // Korean is translated for the English-speaking fan (the test DeepL marks it "[EN-US]").
  await sendText(starPage, "안녕하세요 팬 여러분!");
  await expect(log(fanPage)).toContainText("[EN-US] 안녕하세요 팬 여러분!");
  await log(fanPage).getByRole("button", { name: c.viewOriginal }).click();
  await expect(log(fanPage)).toContainText("안녕하세요 팬 여러분!");
  await expect(log(fanPage)).not.toContainText("[EN-US]");
  await log(fanPage).getByRole("button", { name: c.showTranslation }).click();
  await expect(log(fanPage)).toContainText("[EN-US] 안녕하세요 팬 여러분!");

  // A message already in English is shown as is, with nothing to toggle.
  await sendText(starPage, "Thank you for coming!");
  await expect(log(fanPage)).toContainText("Thank you for coming!");
  await expect(log(fanPage).getByRole("button", { name: c.viewOriginal })).toHaveCount(1);

  // Saved once: reloading shows the stored translation.
  const db = serviceClient();
  const { data: sent } = await db.from("messages").select("id").eq("conversation_id", conversationId);
  const { data: saved } = await db
    .from("message_translations")
    .select("body, detected_locale")
    .eq("locale", "en")
    .in(
      "message_id",
      sent!.map((row: { id: string }) => row.id),
    )
    .like("body", "%팬 여러분%");
  expect(saved).toEqual([{ body: "[EN-US] 안녕하세요 팬 여러분!", detected_locale: "ko" }]);
  await fanPage.reload();
  await expect(log(fanPage)).toContainText("[EN-US] 안녕하세요 팬 여러분!");

  // Turning translation off shows originals; the choice is remembered.
  await fanPage.getByRole("button", { name: c.translateToggle }).click();
  await expect(log(fanPage)).not.toContainText("[EN-US]");
  await fanPage.reload();
  await expect(fanPage.getByRole("button", { name: c.translateToggle })).toHaveAttribute("aria-pressed", "false");
  await expect(log(fanPage)).not.toContainText("[EN-US]");

  // The sender always sees their own words.
  await expect(log(starPage)).not.toContainText("[EN-US]");
  await close();
});

test("a star reports and blocks a fan; an admin reviews and acts", async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  const { star, fan, conversationId, starPage, fanPage, close } = await setUpChat(browser, testInfo);
  // Unique per run: earlier runs leave reports behind.
  const reason = `Rude messages after I asked politely (${star.name}).`;
  await starPage.goto(`/en/chats/${conversationId}`);
  await fanPage.goto(`/en/chats/${conversationId}`);
  await sendText(fanPage, "You never answer me. Rude!");
  await expect(log(starPage)).toContainText("You never answer me. Rude!");

  // Report the message.
  const message = log(starPage).locator("div.group").filter({ hasText: "You never answer me" });
  await message.getByRole("button", { name: s.reportMessage }).click();
  const dialog = starPage.getByRole("dialog", { name: s.reportMessageTitle });
  await dialog.getByLabel(s.reasonLabel).fill(reason);
  await dialog.getByRole("button", { name: s.sendReport }).click();
  await expect(dialog.getByText(s.reportSent)).toBeVisible();
  await dialog.getByRole("button", { name: s.close }).click();

  // Block, then unblock.
  await starPage.getByRole("button", { name: s.menu }).click();
  await starPage.getByRole("menuitem", { name: fill(s.block, { name: fan.name }) }).click();
  await starPage.getByRole("dialog").getByRole("button", { name: s.blockConfirm }).click();
  await expect(starPage.getByText(fill(s.youBlocked, { name: fan.name }))).toBeVisible();
  await expect(composer(starPage)).toHaveCount(0);
  await sendText(fanPage, "Hello?");
  await expect(pageAlert(fanPage)).toHaveText(c.errors.cannotPost);
  await starPage.getByRole("button", { name: fill(s.unblock, { name: fan.name }) }).click();
  await expect(composer(starPage)).toBeVisible();

  // An admin finds the report, opens the chat (logged), removes the message.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminAccount = await createUser("admin", testInfo);
  await signInAsNewAdmin(admin, "en", adminAccount.email);
  await admin.getByRole("link", { name: new RegExp(`^${en.admin.nav.moderation}`) }).click();
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText(m.title);
  const report = admin.getByRole("listitem").filter({ hasText: reason });
  await expect(report).toContainText(fill(m.reportedBy, { name: star.name }));
  await expect(report).toContainText(`${fan.name} ↔ ${star.name}`);
  await expect(report).not.toContainText("You never answer me");
  await report.getByRole("link", { name: m.review }).click();

  await expect(admin.getByText(m.viewLogged)).toBeVisible();
  const { data: views } = await serviceClient()
    .from("audit_logs")
    .select("id")
    .eq("action", "conversations.viewed")
    .eq("target_id", conversationId)
    .eq("admin_id", adminAccount.id);
  expect(views!.length).toBeGreaterThanOrEqual(1);

  const reported = admin.getByRole("listitem").filter({ hasText: "You never answer me. Rude!" });
  await expect(reported).toContainText(m.reportedMessage);
  await reported.getByRole("button", { name: m.removeMessage }).click();
  await reported.getByLabel(m.removeReasonLabel).fill("Abusive");
  await reported.getByRole("button", { name: m.confirmRemove }).click();
  await expect(reported).toContainText(`${m.removed}: Abusive`);
  await expect(log(fanPage)).toContainText(c.removedMessage);
  await expect(log(fanPage)).not.toContainText("You never answer me");

  // Resolve the report; it leaves the queue.
  const reportCard = admin.getByRole("listitem").filter({ hasText: reason });
  await reportCard.getByRole("button", { name: m.resolve }).click();
  await reportCard.getByLabel(m.resolutionLabel).fill("Message removed, fan warned.");
  await reportCard.getByRole("button", { name: m.confirmResolve }).click();
  await expect(reportCard).toContainText(fill(m.handledBy, { name: "E2E Admin" }));

  // Suspend the fan: they can no longer send. Then close the chat.
  await admin.getByRole("button", { name: fill(m.suspend, { name: fan.name }) }).click();
  await admin.getByRole("button", { name: fill(m.confirmSuspend, { name: fan.name }) }).click();
  await expect(admin.getByRole("button", { name: fill(m.restore, { name: fan.name }) })).toBeVisible();
  await sendText(fanPage, "Are you there?");
  await expect(pageAlert(fanPage)).toHaveText(c.errors.cannotPost);

  await admin.getByRole("button", { name: m.closeChat }).click();
  await admin.getByRole("button", { name: m.confirmClose }).click();
  await expect(admin.getByText(/^Chat closed/)).toBeVisible();
  await starPage.reload();
  await expect(starPage.getByText(c.closed)).toBeVisible();
  await expectNoHorizontalScroll(admin);

  const { data: audit } = await serviceClient()
    .from("audit_logs")
    .select("action")
    .eq("admin_id", adminAccount.id)
    .in("action", ["messages.update", "reports.update", "users.update", "conversations.closed"]);
  expect(new Set(audit!.map((a: { action: string }) => a.action))).toEqual(
    new Set(["messages.update", "reports.update", "users.update", "conversations.closed"]),
  );
  await adminContext.close();
  await close();
});

test("admins can't open conversations nobody reported", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "authenticator set-up is slow; desktop covers it");
  const { conversationId, close } = await setUpChat(browser, testInfo);
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsNewAdmin(admin, "en", (await createUser("admin", testInfo)).email);
  const response = await admin.goto(`/en/admin/moderation/conversations/${conversationId}`);
  expect(response?.status()).toBe(404);
  await adminContext.close();
  await close();
});

test("safety controls and moderation in ar (rtl)", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { star, conversationId, fanPage, close } = await setUpChat(browser, testInfo, "ar");
  await fanPage.goto(`/ar/chats/${conversationId}`);
  await expect(fanPage.locator("html")).toHaveAttribute("dir", "rtl");
  await fanPage.getByRole("button", { name: ar.chat.safety.menu }).click();
  await fanPage.getByRole("menuitem", { name: ar.chat.safety.reportChat }).click();
  const dialog = fanPage.getByRole("dialog", { name: ar.chat.safety.reportChatTitle });
  await dialog.getByLabel(ar.chat.safety.reasonLabel).fill("اختبار");
  await dialog.getByRole("button", { name: ar.chat.safety.sendReport }).click();
  await expect(dialog.getByText(ar.chat.safety.reportSent)).toBeVisible();
  await expectNoHorizontalScroll(fanPage);

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsNewAdmin(admin, "ar", (await createUser("admin", testInfo)).email);
  await admin.goto("/ar/admin/moderation");
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText(ar.admin.moderation.title);
  await expect(admin.getByRole("listitem").filter({ hasText: star.name }).first()).toBeVisible();
  await expectNoHorizontalScroll(admin);
  await adminContext.close();
  await close();
});
