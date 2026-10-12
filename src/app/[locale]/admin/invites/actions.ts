"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { requireAdminAction } from "@/lib/auth/viewer";
import { formatInviteCode, inviteLink } from "@/lib/invites/code";

export type InviteError =
  | "invalidName"
  | "invalidEmail"
  | "emailHasOpenInvite"
  | "notAllowed"
  | "notFound"
  | "forbidden"
  | "unknown";

/** What the admin sees after creating an invite or regenerating its code. */
export type IssuedInvite = {
  kind: "created" | "regenerated";
  fanName: string;
  code: string;
  link: string;
  expiresAt: string;
};

type Result = { ok: true; invite: IssuedInvite } | { ok: false; error: InviteError };

function mapError(error: PostgrestError): InviteError {
  switch (error.code) {
    case "23505":
      return "emailHasOpenInvite";
    case "22023":
      return "notAllowed";
    case "P0002":
      return "notFound";
    case "42501":
      return "forbidden";
    default:
      // Only the error code: messages can quote values (CLAUDE.md › never log codes).
      console.error("invite action failed", error.code);
      return "unknown";
  }
}

function issued(kind: IssuedInvite["kind"], fanName: string, code: string, expiresAt: string): IssuedInvite {
  return {
    kind,
    fanName,
    code: formatInviteCode(code),
    link: inviteLink(publicEnv.NEXT_PUBLIC_SITE_URL, code),
    expiresAt,
  };
}

const createSchema = z.object({
  fanName: z.string().trim().min(1).max(120),
  email: z.email().max(254),
});

export async function createInvite(input: { fanName: string; email: string }): Promise<Result> {
  const parsed = createSchema.safeParse({ fanName: input.fanName, email: input.email.trim() });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, error: field === "email" ? "invalidEmail" : "invalidName" };
  }

  const admin = await requireAdminAction();
  if (!admin) return { ok: false, error: "forbidden" };

  const { data, error } = await admin.supabase
    .rpc("admin_create_invite", { p_fan_name: parsed.data.fanName, p_email: parsed.data.email })
    .single();
  if (error) return { ok: false, error: mapError(error) };

  refresh();
  return { ok: true, invite: issued("created", parsed.data.fanName, data.code, data.expires_at) };
}

const idSchema = z.uuid();

export async function regenerateInviteCode(inviteId: string): Promise<Result> {
  const id = idSchema.safeParse(inviteId);
  if (!id.success) return { ok: false, error: "notFound" };

  const admin = await requireAdminAction();
  if (!admin) return { ok: false, error: "forbidden" };

  const { data, error } = await admin.supabase
    .rpc("admin_regenerate_invite_code", { p_invite_id: id.data })
    .single();
  if (error) return { ok: false, error: mapError(error) };

  const { data: invite } = await admin.supabase
    .from("invites")
    .select("fan_name")
    .eq("id", id.data)
    .single();

  refresh();
  return {
    ok: true,
    invite: issued("regenerated", invite?.fan_name ?? "", data.code, data.expires_at),
  };
}

export async function revokeInvite(inviteId: string): Promise<{ ok: true } | { ok: false; error: InviteError }> {
  const id = idSchema.safeParse(inviteId);
  if (!id.success) return { ok: false, error: "notFound" };

  const admin = await requireAdminAction();
  if (!admin) return { ok: false, error: "forbidden" };

  const { error } = await admin.supabase.rpc("admin_revoke_invite", { p_invite_id: id.data });
  if (error) return { ok: false, error: mapError(error) };

  refresh();
  return { ok: true };
}
