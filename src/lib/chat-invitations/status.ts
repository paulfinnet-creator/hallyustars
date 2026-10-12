import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

export type ChatInvitationStatus = Database["public"]["Enums"]["chat_invitation_status"];

export const MESSAGE_MAX = 500;
export const REASON_MAX = 500;

/** What a fan writes to a star (same limits as the database). */
export const invitationMessageSchema = z.string().trim().min(1).max(MESSAGE_MAX);

/**
 * Status to show. Nothing flips a waiting invitation when its expiry passes
 * (see 20261009000500_chat_invitation_flow.sql), so it is shown as expired.
 */
export function displayInvitationStatus(
  status: ChatInvitationStatus,
  expiresAt: string,
  now: Date,
): ChatInvitationStatus {
  if (status === "pending" && Date.parse(expiresAt) <= now.getTime()) return "expired";
  return status;
}

/** Still waiting for an admin, and not past its expiry. */
export function isWaiting(status: ChatInvitationStatus, expiresAt: string, now: Date): boolean {
  return displayInvitationStatus(status, expiresAt, now) === "pending";
}
