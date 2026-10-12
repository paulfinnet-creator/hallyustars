"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth/viewer";
import { REASON_MAX } from "@/lib/chat-invitations/status";
import { sendInvitationDecisionEmail } from "@/lib/notifications/invitations";

export type DecisionError = "invalid" | "expired" | "noLogin" | "alreadyDecided" | "notFound" | "forbidden" | "failed";

const decisionSchema = z.object({
  invitationId: z.uuid(),
  approve: z.boolean(),
  reason: z.string().trim().max(REASON_MAX),
});

/**
 * Approve (creates the conversation) or reject with an optional reason for
 * the fan. The database function writes the audit row in the same transaction.
 */
export async function decideInvitation(input: z.input<typeof decisionSchema>): Promise<{ ok: true } | { error: DecisionError }> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };

  const { error } = await admin.supabase.rpc("admin_decide_chat_invitation", {
    p_invitation_id: parsed.data.invitationId,
    p_approve: parsed.data.approve,
    p_reason: parsed.data.reason || undefined,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" };
    if (error.code === "P0002") return { error: "notFound" };
    if (error.code === "23514") return { error: "invalid" };
    if (error.code === "22023") {
      if (error.message.includes("expired")) return { error: "expired" };
      if (error.message.includes("login")) return { error: "noLogin" };
      return { error: "alreadyDecided" };
    }
    console.error("invitation decision failed", error.code);
    return { error: "failed" };
  }
  // The fan always hears the outcome; sent after the response.
  after(() => sendInvitationDecisionEmail(parsed.data.invitationId));
  refresh();
  return { ok: true };
}
