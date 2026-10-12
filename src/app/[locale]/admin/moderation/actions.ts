"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth/viewer";

/**
 * Moderation actions. Each calls a database function that checks the admin
 * (with MFA) and writes audit_logs in the same transaction.
 */

export type ModerationError = "invalid" | "stale" | "forbidden" | "failed";
type Result = { ok: true } | { error: ModerationError };

function mapError(error: PostgrestError): ModerationError {
  if (error.code === "42501") return "forbidden";
  if (error.code === "22023") return "stale";
  console.error("moderation action failed", error.code);
  return "failed";
}

async function run(call: (admin: NonNullable<Awaited<ReturnType<typeof requireAdminAction>>>) => PromiseLike<{ error: PostgrestError | null }>): Promise<Result> {
  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };
  const { error } = await call(admin);
  if (error) return { error: mapError(error) };
  refresh();
  return { ok: true };
}

const note = z.string().trim().max(1000);

export async function handleReport(input: { reportId: string; status: "resolved" | "dismissed"; resolution: string }) {
  const parsed = z
    .object({ reportId: z.uuid(), status: z.enum(["resolved", "dismissed"]), resolution: note })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid" } as const;
  const { reportId, status, resolution } = parsed.data;
  return run(({ supabase }) =>
    supabase.rpc("admin_handle_report", { p_report_id: reportId, p_status: status, p_resolution: resolution || undefined }),
  );
}

export async function removeMessage(input: { messageId: string; reason: string }) {
  const parsed = z.object({ messageId: z.uuid(), reason: note }).safeParse(input);
  if (!parsed.success) return { error: "invalid" } as const;
  return run(({ supabase }) =>
    supabase.rpc("admin_remove_message", { p_message_id: parsed.data.messageId, p_reason: parsed.data.reason || undefined }),
  );
}

export async function closeConversation(conversationId: string) {
  const id = z.uuid().safeParse(conversationId);
  if (!id.success) return { error: "invalid" } as const;
  return run(({ supabase }) => supabase.rpc("admin_close_conversation", { p_conversation_id: id.data }));
}

export async function setSuspended(input: { userId: string; suspended: boolean }) {
  const parsed = z.object({ userId: z.uuid(), suspended: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "invalid" } as const;
  return run(({ supabase }) =>
    supabase.rpc("admin_set_user_suspended", { p_user_id: parsed.data.userId, p_suspended: parsed.data.suspended }),
  );
}
