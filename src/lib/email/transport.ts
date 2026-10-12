import "server-only";
import { serverEnv } from "@/lib/env.server";

/**
 * Sends one email to one recipient (never CC/BCC lists).
 *
 * Production uses Resend. Local development and tests set
 * EMAIL_TRANSPORT=mailpit so every email lands in the local Mailpit inbox
 * (the one Supabase starts) instead of going to real addresses.
 */

export type OutgoingEmail = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export class EmailError extends Error {
  constructor(readonly status: number) {
    super(`email send failed (${status})`);
  }
}

function splitAddress(value: string): { Email: string; Name?: string } {
  const match = /^(.*)<([^>]+)>$/.exec(value.trim());
  return match ? { Name: match[1]!.trim(), Email: match[2]!.trim() } : { Email: value.trim() };
}

async function sendWithMailpit(email: OutgoingEmail): Promise<string> {
  const base = process.env.MAILPIT_URL?.trim() || "http://127.0.0.1:54324";
  const response = await fetch(`${base}/api/v1/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      From: splitAddress(email.from),
      To: [splitAddress(email.to)],
      ReplyTo: [splitAddress(email.replyTo)],
      Subject: email.subject,
      HTML: email.html,
      Text: email.text,
      Headers: email.headers ?? {},
    }),
  });
  if (!response.ok) throw new EmailError(response.status);
  const { ID } = (await response.json()) as { ID: string };
  return ID;
}

async function sendWithResend(email: OutgoingEmail): Promise<string> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${serverEnv("RESEND_API_KEY")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      reply_to: email.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    }),
  });
  if (!response.ok) throw new EmailError(response.status);
  const { id } = (await response.json()) as { id: string };
  return id;
}

/** Sends the email and returns the provider's id. Never logs addresses or content. */
export async function sendEmail(email: OutgoingEmail): Promise<string> {
  return process.env.EMAIL_TRANSPORT === "mailpit" ? sendWithMailpit(email) : sendWithResend(email);
}
