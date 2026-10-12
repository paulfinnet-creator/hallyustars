import "server-only";
import { Client, Receiver } from "@upstash/qstash";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Delayed chat-email checks through Upstash QStash. Locally, QSTASH_URL
 * points at the QStash development server (`npm run qstash`), which can call
 * localhost; in production it is unset and the client uses Upstash.
 */

export const CHAT_CHECK_PATH = "/api/notifications/chat";

export type ChatCheckJob = { userId: string; conversationId: string; jobId: string };

export function isQStashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN?.trim());
}

/** Seconds between a message and its email check: 5 minutes (tests shorten it). */
export function chatEmailDelaySeconds(): number {
  const value = Number(process.env.CHAT_EMAIL_DELAY_SECONDS);
  return Number.isInteger(value) && value > 0 ? value : 300;
}

function client() {
  return new Client({ token: serverEnv("QSTASH_TOKEN"), baseUrl: process.env.QSTASH_URL?.trim() || undefined });
}

export async function publishChatCheck(job: ChatCheckJob, when: { delaySeconds: number } | { at: Date }) {
  await client().publishJSON({
    url: `${publicEnv.NEXT_PUBLIC_SITE_URL}${CHAT_CHECK_PATH}`,
    body: job,
    ...("delaySeconds" in when
      ? { delay: when.delaySeconds }
      : { notBefore: Math.ceil(when.at.getTime() / 1000) }),
    retries: 3,
  });
}

/** True when the request really comes from QStash (CLAUDE.md: verify every callback). */
export async function isFromQStash(signature: string | null, body: string): Promise<boolean> {
  if (!signature) return false;
  const receiver = new Receiver({
    currentSigningKey: serverEnv("QSTASH_CURRENT_SIGNING_KEY"),
    nextSigningKey: serverEnv("QSTASH_NEXT_SIGNING_KEY"),
  });
  try {
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}
