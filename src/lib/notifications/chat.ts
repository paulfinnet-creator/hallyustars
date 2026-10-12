import "server-only";
import { FROM } from "@/lib/email/addresses";
import { chatMessageEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/transport";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  chatEmailDelaySeconds,
  isQStashConfigured,
  publishChatCheck,
  type ChatCheckJob,
} from "./qstash";
import { loadRecipient, siteUrl, standardHeaders } from "./recipient";

/**
 * Chat message emails (CLAUDE.md › Email notifications):
 * 1. a new message queues one delayed check per recipient and conversation;
 * 2. after 5 minutes the check emails only if the messages are still unread;
 * 3. at most one email per conversation per hour, later ones give a count;
 * 4. reading the chat deletes the queue row, so the check finds nothing.
 * The decisions are in the database (chat_email_enqueue / chat_email_check).
 */

/** After a member sends a message. Never throws: email is best effort. */
export async function queueChatEmails(conversationId: string, senderId: string): Promise<void> {
  if (!isQStashConfigured()) return;
  const admin = createAdminClient();
  const delaySeconds = chatEmailDelaySeconds();
  const { data: queued, error } = await admin.rpc("chat_email_enqueue", {
    p_conversation_id: conversationId,
    p_sender_id: senderId,
    p_delay_seconds: delaySeconds,
  });
  if (error) {
    console.error("chat email enqueue failed", error.code);
    return;
  }
  for (const row of queued ?? []) {
    try {
      await publishChatCheck({ userId: row.user_id, conversationId, jobId: row.job_id }, { delaySeconds });
    } catch (publishError) {
      // Free the slot so the next message tries again.
      await admin.from("chat_email_queue").delete().match({ user_id: row.user_id, conversation_id: conversationId, job_id: row.job_id });
      console.error("chat email publish failed", publishError instanceof Error ? publishError.name : "unknown");
    }
  }
}

type Decision =
  | { action: "none" }
  | { action: "wait"; retry_at: string }
  | { action: "send"; count: number; sender_id: string; last_at: string };

/** The delayed check, called by QStash. */
export async function runChatCheck(job: ChatCheckJob): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("chat_email_check", {
    p_user_id: job.userId,
    p_conversation_id: job.conversationId,
    p_job_id: job.jobId,
  });
  if (error) throw new Error(`chat email check failed: ${error.code}`);
  const decision = data as Decision;

  if (decision.action === "none") return;
  if (decision.action === "wait") {
    await publishChatCheck(job, { at: new Date(decision.retry_at) });
    return;
  }

  const done = () =>
    admin.from("chat_email_queue").delete().match({ user_id: job.userId, conversation_id: job.conversationId, job_id: job.jobId });

  const [recipient, sender, star] = await Promise.all([
    loadRecipient(admin, job.userId),
    admin.from("users").select("display_name, avatar_url").eq("id", decision.sender_id).single(),
    admin.from("celebrity_profiles").select("photo_url").eq("user_id", decision.sender_id).maybeSingle(),
  ]);
  if (!recipient || sender.error) {
    await done();
    return;
  }

  const email = await chatMessageEmail({
    locale: recipient.locale,
    timeZone: recipient.timeZone,
    senderName: sender.data.display_name,
    senderAvatarUrl: sender.data.avatar_url ?? star.data?.photo_url ?? null,
    count: decision.count,
    lastAt: decision.last_at,
    chatUrl: siteUrl(`/${recipient.locale}/chats/${job.conversationId}`),
    unsubscribeUrl: siteUrl(`/${recipient.locale}/unsubscribe?token=${recipient.unsubscribeToken}`),
    settingsUrl: siteUrl(`/${recipient.locale}/settings`),
  });

  let providerId: string | null = null;
  try {
    providerId = await sendEmail({ from: FROM, to: recipient.email, ...standardHeaders(recipient), ...email });
  } catch (sendError) {
    console.error("chat email send failed", sendError instanceof Error ? sendError.message : "unknown");
  }
  await admin.from("email_log").insert({
    user_id: job.userId,
    type: "chat_message",
    conversation_id: job.conversationId,
    message_count: decision.count,
    status: providerId ? "sent" : "failed",
    provider_id: providerId,
    sent_at: providerId ? new Date().toISOString() : null,
  });
  await done();
}
