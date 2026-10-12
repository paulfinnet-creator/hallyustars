import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** Tests that need local Supabase (npm run db:start + .env.local) skip without it. */
export const hasLocalSupabase =
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").startsWith("http://127.0.0.1");

const MAILPIT = "http://127.0.0.1:54324";

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * A fresh account for one test, so parallel tests never share an inbox or hit
 * the one-code-per-minute limit. Staff accounts start approved; fans are
 * approved here explicitly. Returns the email and user id.
 */
export async function createUser(
  role: "admin" | "fan" | "celebrity",
  testInfo: TestInfo,
  fanStatus: "approved" | "pending_review" = "approved",
  displayName = { admin: "E2E Admin", fan: "E2E Fan", celebrity: "E2E Star" }[role],
) {
  const email = `e2e-${role}-${testInfo.project.name}-${randomUUID().slice(0, 8)}@hallyustars.test`;
  const supabase = serviceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { display_name: displayName },
  });
  if (error) throw error;
  if (role === "fan") {
    const { error: updateError } = await supabase.from("users").update({ status: fanStatus }).eq("id", data.user.id);
    if (updateError) throw updateError;
  }
  return { email, id: data.user.id };
}

/** Like createUser, returning just the email. */
export async function createAccount(
  role: "admin" | "fan" | "celebrity",
  testInfo: TestInfo,
  fanStatus: "approved" | "pending_review" = "approved",
) {
  return (await createUser(role, testInfo, fanStatus)).email;
}

/** A star with a login account who accepts chat invitations. */
export async function createOpenCelebrity(testInfo: TestInfo) {
  const name = `Star${Array.from(randomBytes(10), (b) => String.fromCharCode(97 + (b % 26))).join("")}`;
  const account = await createUser("celebrity", testInfo, "approved", name);
  const { data, error } = await serviceClient()
    .from("celebrity_profiles")
    .insert({ stage_name: name, category: "kpop", user_id: account.id, accepts_invites: true })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, name, userId: account.id };
}

/**
 * An approved chat between a fan and a star (as if an admin approved the
 * invitation). Returns the conversation id.
 */
export async function createConversation(fanId: string, celebrityProfileId: string, celebrityUserId: string) {
  const db = serviceClient();
  const { data: invitation, error } = await db
    .from("chat_invitations")
    .insert({
      fan_id: fanId,
      celebrity_id: celebrityProfileId,
      message: "Hello!",
      status: "approved",
      decided_by_admin: "a0000000-0000-4000-8000-000000000001",
      decided_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  const { data: conversation, error: conversationError } = await db
    .from("conversations")
    .insert({ chat_invitation_id: invitation.id })
    .select("id")
    .single();
  if (conversationError) throw conversationError;
  const { error: membersError } = await db.from("conversation_members").insert([
    { conversation_id: conversation.id, user_id: fanId },
    { conversation_id: conversation.id, user_id: celebrityUserId },
  ]);
  if (membersError) throw membersError;
  return conversation.id as string;
}

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A fresh invite (as if an admin created it). Returns the code as shown to fans. */
export async function createInvite(testInfo: TestInfo, fanName = "E2E Fan") {
  const email = `e2e-invite-${testInfo.project.name}-${randomUUID().slice(0, 8)}@fans.test`;
  const body = Array.from({ length: 8 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  const { error } = await serviceClient().from("invites").insert({
    fan_name: fanName,
    email,
    code: `SKCE${body}`,
    created_by_admin: "a0000000-0000-4000-8000-000000000001",
  });
  if (error) throw error;
  return { email, code: `SKCE-${body.slice(0, 4)}-${body.slice(4)}` };
}

export { serviceClient };

/**
 * A fan who finished registration and waits for review: account, invite,
 * photo + 400×400 copy + ID in the private bucket, and a pending verification.
 */
export async function createPendingFan(testInfo: TestInfo, name: string) {
  const { default: sharp } = await import("sharp");
  const db = serviceClient();
  const email = `e2e-pending-${testInfo.project.name}-${randomUUID().slice(0, 8)}@fans.test`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: "fan" },
    user_metadata: { display_name: name },
  });
  if (error) throw error;
  const userId = data.user.id;

  const jpeg = (w: number, h: number, color: string) =>
    sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();
  const storage = db.storage.from("id-documents");
  const photo = `${userId}/profile-${randomUUID()}.jpg`;
  const id = `${userId}/id-${randomUUID()}.jpg`;
  for (const [path, body] of [
    [photo, await jpeg(800, 800, "#3f7a69")],
    [photo.replace(/\.jpg$/, "-400.jpg"), await jpeg(400, 400, "#3f7a69")],
    [id, await jpeg(1200, 800, "#e9e1cf")],
  ] as const) {
    const { error: uploadError } = await storage.upload(path, body, { contentType: "image/jpeg" });
    if (uploadError) throw uploadError;
  }

  const steps = [
    db.from("users").update({ status: "pending_review" }).eq("id", userId),
    db.from("invites").insert({
      fan_name: name,
      email,
      created_by_admin: "a0000000-0000-4000-8000-000000000001",
      status: "pending_review",
      user_id: userId,
      used_at: new Date().toISOString(),
    }),
  ];
  for (const step of steps) {
    const { error: stepError } = await step;
    if (stepError) throw stepError;
  }
  const { data: verification, error: vError } = await db
    .from("verifications")
    .insert({ user_id: userId, profile_photo_path: photo, id_document_path: id, id_document_type: "passport" })
    .select("id")
    .single();
  if (vError) throw vError;
  return { email, userId, verificationId: verification.id };
}

/** The 6-digit code from a sign-in email to `email` that arrived after `since` (ms). */
export async function emailedCode(email: string, since: number): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
        const { messages } = (await search.json()) as { messages: { ID: string; Created: string }[] };
        // Ignore earlier codes to the same address (Mailpit stores second precision).
        const latest = messages?.find((m) => Date.parse(m.Created) >= since - 1000);
        if (!latest) return false;
        const message = await fetch(`${MAILPIT}/api/v1/message/${latest.ID}`);
        const { Text, HTML } = (await message.json()) as { Text: string; HTML: string };
        code = /\b(\d{6})\b/.exec(Text || HTML.replace(/<[^>]+>/g, " "))?.[1];
        return !!code;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return code!;
}

export type Email = { ID: string; Subject: string; Text: string; HTML: string; Headers: Record<string, string[]> };

/** Every email to `email` in Mailpit, newest first, with body and headers. */
export async function emailsTo(email: string): Promise<Email[]> {
  const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const { messages } = (await search.json()) as { messages: { ID: string }[] | null };
  return Promise.all(
    (messages ?? []).map(async ({ ID }) => {
      const [message, headers] = await Promise.all([
        fetch(`${MAILPIT}/api/v1/message/${ID}`).then((r) => r.json() as Promise<{ Subject: string; Text: string; HTML: string }>),
        fetch(`${MAILPIT}/api/v1/message/${ID}/headers`).then((r) => r.json() as Promise<Record<string, string[]>>),
      ]);
      return { ID, Subject: message.Subject, Text: message.Text, HTML: message.HTML, Headers: headers };
    }),
  );
}

/** Waits for an email to `email` whose subject is `subject`. */
export async function waitForEmail(email: string, subject: string, timeout = 30_000): Promise<Email> {
  let found: Email | undefined;
  await expect
    .poll(
      async () => {
        found = (await emailsTo(email)).find((m) => m.Subject === subject);
        return found !== undefined;
      },
      { timeout, message: `email "${subject}"` },
    )
    .toBe(true);
  return found!;
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), what an authenticator app shows. */
export function totp(base32Secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32Secret.replace(/[\s=]/g, "").toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

/** Email step + code step. Leaves the page on whatever comes next. */
export async function signInWithEmailCode(page: Page, locale: string, email: string) {
  await page.goto(`/${locale}/sign-in`);
  await page.locator("#email").fill(email);
  const since = Date.now();
  await page.locator("#email").press("Enter");
  await expect(page.locator("#code")).toBeVisible();
  await page.locator("#code").fill(await emailedCode(email, since));
  await page.locator("#code").press("Enter");
}

/**
 * Full first-time admin sign-in: email code, then authenticator set-up.
 * Returns the TOTP secret so a test can sign in again later.
 */
export async function signInAsNewAdmin(page: Page, locale: string, email: string): Promise<string> {
  await signInWithEmailCode(page, locale, email);
  const secretBox = page.getByTestId("mfa-secret");
  await expect(secretBox).toBeVisible();
  const secret = (await secretBox.textContent())!.replace(/\s/g, "");
  await page.locator("#mfa-code").fill(totp(secret));
  await page.locator("#mfa-code").press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${locale}/admin/invites$`));
  return secret;
}

/** The page's own error message (Next's route announcer is also role="alert"). */
export function pageAlert(page: Page) {
  return page.getByRole("main").getByRole("alert");
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** A fan and a star with an approved conversation, each signed in in their own browser. */
export async function setUpChat(browser: Browser, testInfo: TestInfo, locale = "en") {
  const star = await createOpenCelebrity(testInfo);
  const fanName = `Fan of ${star.name}`;
  const fan = await createUser("fan", testInfo, "approved", fanName);
  const conversationId = await createConversation(fan.id, star.id, star.userId);

  // The star's device is in Seoul: signing in saves that timezone.
  const starContext = await browser.newContext({ timezoneId: "Asia/Seoul" });
  const starPage = await starContext.newPage();
  await signInWithEmailCode(starPage, locale, (await serviceClient().auth.admin.getUserById(star.userId)).data.user!.email!);
  await expect(starPage).toHaveURL(new RegExp(`/${locale}/chats$`));

  const fanContext = await browser.newContext({ timezoneId: "Africa/Lagos" });
  const fanPage = await fanContext.newPage();
  await signInWithEmailCode(fanPage, locale, fan.email);
  await expect(fanPage).toHaveURL(new RegExp(`/${locale}/celebrities$`));

  return {
    star,
    fan: { ...fan, name: fanName },
    conversationId,
    starPage,
    fanPage,
    close: async () => {
      await starContext.close();
      await fanContext.close();
    },
  };
}
