import { createHash } from "node:crypto";
import { z } from "zod";
import { AUTO_REPLY_FROM, isAutomatedSender, localeFromReplyAddresses, replyToFor } from "@/lib/email/addresses";
import { autoReplyEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/transport";
import { isValidWebhook } from "@/lib/email/webhook";
import { serverEnv } from "@/lib/env.server";
import { siteUrl } from "@/lib/notifications/recipient";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resend's email.received webhook for reply.hallyustars.org: someone replied
 * to a notification. Answer once a day per sender, in the language tagged in
 * the address they replied to. The webhook carries no body, and nothing about
 * the reply is stored or logged.
 */

const eventSchema = z.object({
  type: z.string(),
  data: z.object({
    from: z.string(),
    to: z.array(z.string()).default([]),
    subject: z.string().default(""),
    message_id: z.string().optional(),
  }),
});

export async function POST(request: Request) {
  const body = await request.text();
  const valid = isValidWebhook({
    secret: serverEnv("RESEND_WEBHOOK_SECRET"),
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
  });
  if (!valid) return new Response("invalid signature", { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const event = eventSchema.safeParse(json);
  if (!event.success) return new Response("bad request", { status: 400 });
  if (event.data.type !== "email.received") return new Response(null, { status: 204 });

  const { from, to, subject, message_id: messageId } = event.data.data;
  const sender = from.trim().toLowerCase();
  if (!z.email().safeParse(sender).success || isAutomatedSender(sender, subject)) {
    return new Response(null, { status: 204 });
  }

  const addressHash = createHash("sha256").update(sender).digest("hex");
  const { data: allowed, error } = await createAdminClient().rpc("claim_auto_reply", { p_address_hash: addressHash });
  if (error) return new Response("failed", { status: 500 });
  if (!allowed) return new Response(null, { status: 204 });

  const locale = localeFromReplyAddresses(to);
  const email = await autoReplyEmail({ locale, chatsUrl: siteUrl(`/${locale}/chats`) });
  try {
    await sendEmail({
      from: AUTO_REPLY_FROM,
      to: sender,
      replyTo: replyToFor(locale),
      ...email,
      headers: {
        "Auto-Submitted": "auto-replied",
        ...(messageId ? { "In-Reply-To": messageId, References: messageId } : {}),
      },
    });
  } catch (sendError) {
    console.error("auto-reply send failed", sendError instanceof Error ? sendError.message : "unknown");
  }
  return new Response(null, { status: 204 });
}
