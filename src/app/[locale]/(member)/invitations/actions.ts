"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { invitationMessageSchema } from "@/lib/chat-invitations/status";
import { withinRateLimit } from "@/lib/rate-limit";

export type InvitationError =
  | "invalid"
  | "notOpen"
  | "alreadyWaiting"
  | "alreadyConnected"
  | "rateLimited"
  | "notFound"
  | "forbidden"
  | "failed";

type Result = { ok: true } | { error: InvitationError };

/** Invitations a fan may send per day, across all stars. */
const DAILY_LIMIT = 10;

async function approvedFan() {
  const { supabase, viewer } = await getViewer();
  if (!viewer || viewer.role !== "fan" || viewer.status !== "approved") return null;
  return { supabase, viewer };
}

const sendSchema = z.object({ celebrityId: z.uuid(), message: invitationMessageSchema });

export async function sendInvitation(input: { celebrityId: string; message: string }): Promise<Result> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const fan = await approvedFan();
  if (!fan) return { error: "forbidden" };
  if (!(await withinRateLimit(`chat-invitation:${fan.viewer.id}`, DAILY_LIMIT, 24 * 3600))) {
    return { error: "rateLimited" };
  }

  const { error } = await fan.supabase.rpc("send_chat_invitation", {
    p_celebrity_id: parsed.data.celebrityId,
    p_message: parsed.data.message,
  });
  if (error) {
    // Codes from public.send_chat_invitation; the message text is never logged.
    if (error.code === "42501") return { error: "notOpen" };
    if (error.code === "23505") return { error: "alreadyWaiting" };
    if (error.code === "P0001" && error.message === "already_connected") return { error: "alreadyConnected" };
    if (error.code === "23514") return { error: "invalid" };
    console.error("send invitation failed", error.code);
    return { error: "failed" };
  }
  refresh();
  return { ok: true };
}

export async function withdrawInvitation(invitationId: string): Promise<Result> {
  const id = z.uuid().safeParse(invitationId);
  if (!id.success) return { error: "invalid" };
  const fan = await approvedFan();
  if (!fan) return { error: "forbidden" };

  // RLS: only the fan's own invitation, and only while it is waiting.
  const { data, error } = await fan.supabase
    .from("chat_invitations")
    .update({ status: "withdrawn" })
    .eq("id", id.data)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error("withdraw invitation failed", error.code);
    return { error: "failed" };
  }
  if (!data.length) return { error: "notFound" };
  refresh();
  return { ok: true };
}
