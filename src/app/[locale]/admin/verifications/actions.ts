"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth/viewer";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReviewError = "reasonRequired" | "alreadyDecided" | "unavailable" | "forbidden" | "failed";

const ID_URL_SECONDS = 300;
const idSchema = z.uuid();

/**
 * A 5-minute link to a verification's ID document. Each call is written to
 * the audit log as the acting admin, so only call it when the ID is shown.
 */
export async function revealIdDocument(verificationId: string): Promise<{ url: string } | { error: ReviewError }> {
  const id = idSchema.safeParse(verificationId);
  if (!id.success) return { error: "unavailable" };
  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };

  const { data: v } = await admin.supabase
    .from("verifications")
    .select("id_document_path")
    .eq("id", id.data)
    .maybeSingle();
  if (!v?.id_document_path) return { error: "unavailable" };

  // Log first: no audit row, no link.
  const { error: logError } = await admin.supabase.rpc("admin_log_id_view", { p_verification_id: id.data });
  if (logError) return { error: logError.code === "42501" ? "forbidden" : "unavailable" };

  const { data, error } = await createAdminClient()
    .storage.from("id-documents")
    .createSignedUrl(v.id_document_path, ID_URL_SECONDS);
  if (error) return { error: "unavailable" };
  return { url: data.signedUrl };
}

const decisionSchema = z.object({
  verificationId: z.uuid(),
  approve: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Approve or reject. Approval first publishes the 400×400 photo to the public
 * avatars bucket, then the database records the decision (verification,
 * account and invite) in one audited transaction. Returns the next review.
 */
export async function decideVerification(
  input: z.infer<typeof decisionSchema>,
): Promise<{ nextId: string | null } | { error: ReviewError }> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { error: "failed" };
  const { verificationId, approve, reason } = parsed.data;
  if (!approve && !reason) return { error: "reasonRequired" };

  const admin = await requireAdminAction();
  if (!admin) return { error: "forbidden" };

  const { data: v } = await admin.supabase
    .from("verifications")
    .select("user_id, kind, status, profile_photo_path, fan:users!verifications_user_id_fkey(avatar_url)")
    .eq("id", verificationId)
    .maybeSingle();
  if (!v) return { error: "failed" };
  if (v.status !== "pending") return { error: "alreadyDecided" };
  const previousAvatarUrl = v.fan?.avatar_url ?? null;

  const service = createAdminClient();
  let avatarPath: string | null = null;
  let avatarUrl: string | null = null;
  if (approve) {
    const thumbPath = v.profile_photo_path.replace(/\.jpg$/, "-400.jpg");
    const { data: thumb, error: downloadError } = await service.storage.from("id-documents").download(thumbPath);
    if (downloadError) return { error: "failed" };
    avatarPath = `${v.user_id}/${randomUUID()}.jpg`;
    const { error: uploadError } = await service.storage
      .from("avatars")
      .upload(avatarPath, thumb, { contentType: "image/jpeg" });
    if (uploadError) return { error: "failed" };
    avatarUrl = service.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl;
  }

  const { error } = await admin.supabase.rpc("admin_decide_verification", {
    p_verification_id: verificationId,
    p_approve: approve,
    p_reason: reason ?? undefined,
    p_avatar_url: avatarUrl ?? undefined,
  });
  if (error) {
    if (avatarPath) await service.storage.from("avatars").remove([avatarPath]);
    if (error.code === "22023") return { error: "alreadyDecided" };
    if (error.code === "42501") return { error: "forbidden" };
    console.error("verification decision failed", error.code);
    return { error: "failed" };
  }

  // An approved new photo replaces the old one: delete the old public file.
  if (approve && v.kind === "profile_photo_change" && previousAvatarUrl) {
    const oldPath = avatarPathFromUrl(previousAvatarUrl);
    if (oldPath) await service.storage.from("avatars").remove([oldPath]);
  }

  const { data: next } = await admin.supabase
    .from("verifications")
    .select("id")
    .eq("status", "pending")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  refresh();
  return { nextId: next?.id ?? null };
}

/** "<user>/<uuid>.jpg" from a public avatars URL; null for anything else. */
function avatarPathFromUrl(url: string): string | null {
  const match = /\/storage\/v1\/object\/public\/avatars\/([0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg)$/.exec(url);
  return match?.[1] ?? null;
}
