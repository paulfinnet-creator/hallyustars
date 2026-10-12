import "server-only";
import { FROM } from "@/lib/email/addresses";
import { invitationEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/transport";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRecipient, siteUrl, standardHeaders } from "./recipient";

/**
 * Tells the fan their chat invitation was approved or rejected. Always sent,
 * whatever the chat-email setting (CLAUDE.md › Email notifications). Never
 * throws: the decision is already saved.
 */
export async function sendInvitationDecisionEmail(invitationId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("chat_invitations")
    .select("fan_id, status, reason, celebrity:celebrity_profiles(stage_name), conversation:conversations(id)")
    .eq("id", invitationId)
    .maybeSingle();
  if (!invitation || (invitation.status !== "approved" && invitation.status !== "rejected")) return;
  const approved = invitation.status === "approved";

  const recipient = await loadRecipient(admin, invitation.fan_id);
  if (!recipient) return;
  const conversationId = invitation.conversation?.id;
  const email = await invitationEmail({
    locale: recipient.locale,
    approved,
    celebrityName: invitation.celebrity?.stage_name ?? "",
    reason: invitation.reason,
    url: siteUrl(
      approved && conversationId ? `/${recipient.locale}/chats/${conversationId}` : `/${recipient.locale}/celebrities`,
    ),
  });

  let providerId: string | null = null;
  try {
    providerId = await sendEmail({ from: FROM, to: recipient.email, ...standardHeaders(recipient), ...email });
  } catch (error) {
    console.error("invitation email send failed", error instanceof Error ? error.message : "unknown");
  }
  await admin.from("email_log").insert({
    user_id: recipient.id,
    type: approved ? "invitation_approved" : "invitation_rejected",
    conversation_id: approved ? (conversationId ?? null) : null,
    status: providerId ? "sent" : "failed",
    provider_id: providerId,
    sent_at: providerId ? new Date().toISOString() : null,
  });
}
