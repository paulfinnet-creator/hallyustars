import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import ko from "../messages/ko.json" with { type: "json" };
import {
  createConversation,
  createOpenCelebrity,
  createUser,
  expectNoHorizontalScroll,
  setUpChat,
  hasLocalSupabase,
  pageAlert,
  serviceClient,
  signInWithEmailCode,
} from "./support";

test.skip(!hasLocalSupabase, "needs local Supabase: npm run db:start and .env.local");

const c = en.chat;
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);

const log = (page: Page) => page.getByRole("log");
const composer = (page: Page) => page.getByLabel(c.messageLabel, { exact: true });

async function sendText(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(composer(page)).toHaveValue("");
}

test("a fan and a star chat in real time", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const { star, fan, conversationId, starPage, fanPage, close } = await setUpChat(browser, testInfo);

  // The star writes first; the fan sees it as unread in the chat list.
  await starPage.getByRole("link", { name: new RegExp(fan.name) }).click();
  await expect(starPage.getByRole("heading", { level: 1 })).toContainText(fan.name);
  await sendText(starPage, "Welcome! Thanks for the lovely invitation.");

  await fanPage.getByRole("link", { name: c.listTitle }).click();
  const row = fanPage.getByRole("main").getByRole("link", { name: new RegExp(star.name) });
  await expect(row).toContainText("Welcome! Thanks for the lovely invitation.");
  await expect(row).toContainText("1 unread message");
  await row.click();

  // Header: verified star, their local time in Seoul, and that they're here.
  await expect(fanPage.getByRole("heading", { level: 1 })).toContainText(star.name);
  await expect(fanPage.getByRole("heading", { level: 1 }).getByRole("img", { name: c.verified })).toBeVisible();
  await expect(fanPage.getByText(/^It's .+ in Seoul/)).toBeVisible();
  await expect(fanPage.getByText(c.inChat)).toBeVisible();
  await expect(log(fanPage)).toContainText("Welcome! Thanks for the lovely invitation.");

  // Typing indicator, then the message arrives live.
  await composer(fanPage).pressSequentially("Hi");
  await expect(starPage.getByText(fill(c.typing, { name: fan.name }))).toBeVisible();
  await composer(fanPage).fill("Hi! I'm so happy to talk to you.");
  await composer(fanPage).press("Enter");
  await expect(log(starPage)).toContainText("Hi! I'm so happy to talk to you.");
  await expect(starPage.getByText(fill(c.typing, { name: fan.name }))).toBeHidden();

  // The star has the chat open, so the fan's message shows as seen.
  await expect(log(fanPage).getByText(c.seen)).toBeVisible();

  // Shift+Enter makes a new line instead of sending.
  await composer(fanPage).fill("Line one");
  await composer(fanPage).press("Shift+Enter");
  await composer(fanPage).pressSequentially("Line two");
  await expect(composer(fanPage)).toHaveValue("Line one\nLine two");
  await composer(fanPage).press("Enter");
  await expect(log(starPage)).toContainText("Line one\nLine two");

  // The star reacts; the fan sees it.
  const fanMessage = log(starPage).locator("div.group").filter({ hasText: "so happy to talk" });
  await fanMessage.getByRole("button", { name: c.react }).click();
  await fanMessage.getByRole("button", { name: "❤️" }).click();
  await expect(log(fanPage).getByRole("button", { name: "❤️: 1 reaction" })).toBeVisible();

  // The star sends a photo (with GPS data that must not survive).
  const photoPath = testInfo.outputPath("photo.jpg");
  await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#3f7a69" } })
    .withExif({ IFD0: { Copyright: "secret" }, IFD3: { GPSLatitudeRef: "N" } })
    .jpeg()
    .toFile(photoPath);
  await starPage.getByLabel(c.attachPhoto).setInputFiles(photoPath);
  const photo = fanPage.getByRole("img", { name: fill(c.photoAlt, { name: star.name }) });
  await expect(photo).toBeVisible({ timeout: 20_000 });

  const db = serviceClient();
  const { data: imageMessage } = await db
    .from("messages")
    .select("attachments")
    .eq("conversation_id", conversationId)
    .neq("attachments", "[]")
    .single();
  const attachment = (imageMessage!.attachments as { path: string; width: number; height: number }[])[0]!;
  expect(attachment).toMatchObject({ width: 2000, height: 1333 });
  const { data: file } = await db.storage.from("chat-images").download(attachment.path);
  const meta = await sharp(Buffer.from(await file!.arrayBuffer())).metadata();
  expect(meta.exif).toBeUndefined();
  const { data: files } = await db.storage.from("chat-images").list(conversationId);
  expect(files!.map((f) => f.name)).toEqual([attachment.path.split("/")[1]]);

  // History survives a reload, and the star's messages carry the verified mark.
  await fanPage.reload();
  await expect(log(fanPage)).toContainText("Welcome! Thanks for the lovely invitation.");
  await expect(log(fanPage).getByRole("img", { name: c.verified }).first()).toBeVisible();
  await expectNoHorizontalScroll(fanPage);
  await close();
});

test("the chat list updates live", async ({ browser }, testInfo) => {
  const { star, conversationId, starPage, fanPage, close } = await setUpChat(browser, testInfo);
  await fanPage.goto("/en/chats");
  const row = fanPage.getByRole("main").getByRole("link", { name: new RegExp(star.name) });
  await expect(row).toContainText(c.noMessagesYet);

  // A message arrives while the list is open: no reload needed.
  await starPage.goto(`/en/chats/${conversationId}`);
  await sendText(starPage, "Brand new message");
  await expect(row).toContainText("Brand new message");
  await expect(row).toContainText("1 unread message");

  // Reading it and going back shows the list as it is now, not a cached copy.
  await row.click();
  await expect(log(fanPage)).toContainText("Brand new message");
  await fanPage.goBack();
  await expect(row).toContainText("Brand new message");
  await expect(row).not.toContainText("unread message");
  await close();
});

test("only the two members can open a chat", async ({ page, browser }, testInfo) => {
  const star = await createOpenCelebrity(testInfo);
  const fan = await createUser("fan", testInfo);
  const conversationId = await createConversation(fan.id, star.id, star.userId);

  const outsider = await createUser("fan", testInfo);
  await signInWithEmailCode(page, "en", outsider.email);
  await expect(page).toHaveURL(/\/en\/celebrities$/);
  const response = await page.goto(`/en/chats/${conversationId}`);
  expect(response?.status()).toBe(404);

  // Approved invitations link straight to the chat.
  const fanContext = await browser.newContext();
  const fanPage = await fanContext.newPage();
  await signInWithEmailCode(fanPage, "en", fan.email);
  await expect(fanPage).toHaveURL(/\/en\/celebrities$/);
  await fanPage.goto("/en/invitations");
  await fanPage.getByRole("link", { name: en.invitations.openChat }).click();
  await expect(fanPage).toHaveURL(new RegExp(`/en/chats/${conversationId}$`));
  await expect(fanPage.getByText(fill(c.startOfChat, { name: star.name }))).toBeVisible();
  await fanContext.close();
});

test("a blocked member can't send", async ({ browser }, testInfo) => {
  const { star, fan, conversationId, starPage, fanPage, close } = await setUpChat(browser, testInfo);
  await serviceClient().from("blocks").insert({ blocker_id: star.userId, blocked_id: fan.id });
  await fanPage.goto(`/en/chats/${conversationId}`);
  await composer(fanPage).fill("Are you there?");
  await composer(fanPage).press("Enter");
  await expect(pageAlert(fanPage)).toHaveText(c.errors.cannotPost);
  await expect(composer(fanPage)).toHaveValue("Are you there?");
  await starPage.goto(`/en/chats/${conversationId}`);
  await expect(log(starPage)).not.toContainText("Are you there?");
  await close();
});

test("photos must be images", async ({ browser }, testInfo) => {
  const { conversationId, fanPage, close } = await setUpChat(browser, testInfo);
  await fanPage.goto(`/en/chats/${conversationId}`);
  await fanPage.getByLabel(c.attachPhoto).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(pageAlert(fanPage)).toHaveText(c.errors.wrongType);
  await close();
});

for (const { locale, dir, messages } of [
  { locale: "ko", dir: "ltr", messages: ko },
  { locale: "ar", dir: "rtl", messages: ar },
] as const) {
  test(`chat in ${locale} (${dir})`, async ({ browser }, testInfo) => {
    test.setTimeout(90_000);
    const { star, conversationId, fanPage, starPage, close } = await setUpChat(browser, testInfo, locale);
    await starPage.goto(`/${locale}/chats/${conversationId}`);
    await starPage.getByLabel(messages.chat.messageLabel, { exact: true }).fill("안녕하세요!");
    await starPage.getByLabel(messages.chat.messageLabel, { exact: true }).press("Enter");

    await fanPage.goto(`/${locale}/chats`);
    await expect(fanPage.locator("html")).toHaveAttribute("dir", dir);
    await expect(fanPage.getByRole("heading", { level: 1 })).toHaveText(messages.chat.listTitle);
    await expectNoHorizontalScroll(fanPage);
    await fanPage.getByRole("main").getByRole("link", { name: new RegExp(star.name) }).click();
    await expect(fanPage.getByRole("log")).toContainText("안녕하세요!");
    await expect(fanPage.getByRole("separator")).toHaveText(new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "day").replace(/^./, (ch) => ch.toLocaleUpperCase(locale)));
    await expectNoHorizontalScroll(fanPage);
    await close();
  });
}
