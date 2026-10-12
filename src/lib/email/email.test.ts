import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SUPPORTED } from "@/i18n/config";
import { isAutomatedSender, localeFromReplyAddresses, replyToFor } from "./addresses";
import { isValidWebhook } from "./webhook";

vi.mock("server-only", () => ({}));
const { autoReplyEmail, chatMessageEmail, invitationEmail, signInCodeEmail } = await import("./templates");

describe("reply addresses", () => {
  it("tags the reply address with the recipient's language", () => {
    expect(replyToFor("ar")).toBe("no-reply+ar@reply.hallyustars.org");
  });

  it("reads the language back from the address a reply was sent to", () => {
    expect(localeFromReplyAddresses(["no-reply+ko@reply.hallyustars.org"])).toBe("ko");
    expect(localeFromReplyAddresses(["Hallyu Stars <No-Reply+FR@Reply.Hallyustars.org>"])).toBe("fr");
    expect(localeFromReplyAddresses(["someone@example.com", "no-reply+th@reply.hallyustars.org"])).toBe("th");
  });

  it("falls back to English for untagged or unknown tags", () => {
    expect(localeFromReplyAddresses(["no-reply@reply.hallyustars.org"])).toBe("en");
    expect(localeFromReplyAddresses(["no-reply+xx@reply.hallyustars.org"])).toBe("en");
    expect(localeFromReplyAddresses(["no-reply+ko@other.example"])).toBe("en");
  });

  it("never answers machines or our own addresses", () => {
    expect(isAutomatedSender("MAILER-DAEMON@mx.example.com", "Re: hi")).toBe(true);
    expect(isAutomatedSender("noreply@shop.example", "Re: hi")).toBe(true);
    expect(isAutomatedSender("no-reply@reply.hallyustars.org", "Re: hi")).toBe(true);
    expect(isAutomatedSender("fan@example.com", "Automatic reply: away")).toBe(true);
    expect(isAutomatedSender("fan@example.com", "Out of Office")).toBe(true);
    expect(isAutomatedSender("fan@example.com", "자동 응답")).toBe(true);
    expect(isAutomatedSender("ada@example.com", "Re: New message from Haneul")).toBe(false);
  });
});

describe("webhook signatures", () => {
  const secret = `whsec_${Buffer.from("test-secret-key-0123456789").toString("base64")}`;
  const body = '{"type":"email.received"}';
  const now = new Date("2026-10-10T12:00:00Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const sign = (id: string, ts: string, payload: string) =>
    createHmac("sha256", Buffer.from("test-secret-key-0123456789")).update(`${id}.${ts}.${payload}`).digest("base64");

  it("accepts a correctly signed request", () => {
    const signature = `v1,${sign("msg_1", timestamp, body)}`;
    expect(isValidWebhook({ secret, id: "msg_1", timestamp, signature, body, now })).toBe(true);
  });

  it("accepts when any of several signatures matches", () => {
    const signature = `v1,AAAA v1,${sign("msg_1", timestamp, body)}`;
    expect(isValidWebhook({ secret, id: "msg_1", timestamp, signature, body, now })).toBe(true);
  });

  it("rejects a changed body, a wrong id, missing headers and old requests", () => {
    const signature = `v1,${sign("msg_1", timestamp, body)}`;
    expect(isValidWebhook({ secret, id: "msg_1", timestamp, signature, body: body + " ", now })).toBe(false);
    expect(isValidWebhook({ secret, id: "msg_2", timestamp, signature, body, now })).toBe(false);
    expect(isValidWebhook({ secret, id: null, timestamp, signature, body, now })).toBe(false);
    const later = new Date(now.getTime() + 10 * 60_000);
    expect(isValidWebhook({ secret, id: "msg_1", timestamp, signature, body, now: later })).toBe(false);
  });

  it("accepts Supabase's secret format (v1,whsec_…)", () => {
    const signature = `v1,${sign("msg_1", timestamp, body)}`;
    expect(isValidWebhook({ secret: `v1,${secret}`, id: "msg_1", timestamp, signature, body, now })).toBe(true);
  });
});

describe("email templates", () => {
  const chat = {
    timeZone: "Asia/Seoul",
    senderName: "Haneul",
    senderAvatarUrl: "https://example.supabase.co/storage/v1/object/public/avatars/a.jpg",
    lastAt: "2026-10-10T14:40:00Z",
    chatUrl: "https://hallyustars.org/en/chats/abc",
    unsubscribeUrl: "https://hallyustars.org/en/unsubscribe?token=t",
    settingsUrl: "https://hallyustars.org/en/settings",
  };

  it("names the sender, counts messages and shows the time in the recipient's zone", async () => {
    const one = await chatMessageEmail({ ...chat, locale: "en", count: 1 });
    expect(one.subject).toBe("New message from Haneul");
    const three = await chatMessageEmail({ ...chat, locale: "en", count: 3 });
    expect(three.subject).toBe("You have 3 new messages from Haneul");
    // 14:40 UTC is 11:40 PM in Seoul.
    expect(three.text).toContain("11:40");
    expect(three.html).toContain('href="https://hallyustars.org/en/chats/abc"');
    expect(three.html).toContain('href="https://hallyustars.org/en/unsubscribe?token=t"');
  });

  it("is written in the recipient's language, right to left for Arabic", async () => {
    const ko = await chatMessageEmail({ ...chat, locale: "ko", count: 2 });
    expect(ko.subject).toBe("Haneul님의 새 메시지 2개");
    expect(ko.html).toContain('lang="ko"');
    const ar = await chatMessageEmail({ ...chat, locale: "ar", count: 1 });
    expect(ar.subject).toBe("رسالة جديدة من Haneul");
    expect(ar.html).toContain('dir="rtl"');
  });

  it("renders in every site language", async () => {
    for (const locale of SUPPORTED) {
      const email = await chatMessageEmail({ ...chat, locale, count: 5 });
      expect(email.subject).toContain("Haneul");
      expect(email.html).not.toContain("email.chat");
    }
  });

  it("explains invitation decisions, with the reason when rejected", async () => {
    const approved = await invitationEmail({ locale: "en", approved: true, celebrityName: "Haneul", reason: null, url: "https://x/chat" });
    expect(approved.subject).toBe("Your chat invitation to Haneul was approved");
    const rejected = await invitationEmail({ locale: "en", approved: false, celebrityName: "Haneul", reason: "Schedule is full.", url: "https://x" });
    expect(rejected.subject).toBe("Your chat invitation to Haneul wasn't approved");
    expect(rejected.text).toContain("Schedule is full.");
  });

  it("auto-replies point back to the website", async () => {
    const reply = await autoReplyEmail({ locale: "fr", chatsUrl: "https://hallyustars.org/fr/chats" });
    expect(reply.subject).toBe("Cette adresse ne reçoit pas de messages");
    expect(reply.html).toContain('href="https://hallyustars.org/fr/chats"');
  });

  it("sends the sign-in code in every site language, right to left for Arabic", async () => {
    const en = await signInCodeEmail({ locale: "en", code: "042917", minutes: 10 });
    expect(en.subject).toBe("Your Hallyu Stars sign-in code");
    expect(en.text).toContain("042917");
    expect(en.text).toContain("It expires in 10 minutes.");
    const ar = await signInCodeEmail({ locale: "ar", code: "042917", minutes: 10 });
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.text).toContain("042917");
    for (const locale of SUPPORTED) {
      const email = await signInCodeEmail({ locale, code: "042917", minutes: 10 });
      expect(email.text).toContain("042917");
      expect(email.html).not.toContain("email.signIn");
      // The code must be the only 6-digit number (people and tests look for it).
      expect(email.text.match(/\b\d{6}\b/g)).toEqual(["042917"]);
    }
  });
});
