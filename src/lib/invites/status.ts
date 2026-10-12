import type { Database } from "@/lib/supabase/database.types";

export type InviteStatus = Database["public"]["Enums"]["invite_status"];

/**
 * Status to show an admin. The stored status isn't flipped by a job when the
 * expiry passes, so an unused invite past its expiry is shown as expired.
 */
export function displayInviteStatus(status: InviteStatus, expiresAt: string, now: Date): InviteStatus {
  if (status === "created" && Date.parse(expiresAt) <= now.getTime()) return "expired";
  return status;
}

/** Matches the checks in admin_revoke_invite / admin_regenerate_invite_code. */
export function canChangeInvite(status: InviteStatus): boolean {
  return status === "created" || status === "registering" || status === "expired";
}
