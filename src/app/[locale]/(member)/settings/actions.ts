"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import {
  cleanUpload,
  clearUploads,
  createFanUpload,
  isOwnUpload,
  previewUrl,
  removeFiles,
  removeProfilePhoto,
  saveCropSource,
  saveProfilePhoto,
} from "@/lib/images/fanPhotos";
import { withinRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/** Turn chat message emails on or off (RLS: members update their own row). */
export async function setChatEmails(enabled: boolean): Promise<{ ok: true } | { error: "failed" }> {
  const parsed = z.boolean().safeParse(enabled);
  if (!parsed.success) return { error: "failed" };
  const { supabase, viewer } = await getViewer();
  if (!viewer || viewer.role === "admin") return { error: "failed" };
  const { error } = await supabase
    .from("notification_preferences")
    .update({ chat_emails_enabled: parsed.data })
    .eq("user_id", viewer.id);
  if (error) {
    console.error("chat email setting failed", error.code);
    return { error: "failed" };
  }
  return { ok: true };
}

// ── Profile photo change (approved fans) ──

export type PhotoError = "unreadable" | "rateLimited" | "failed";

/** Only approved fans: celebrities' photos are managed by admins. */
async function approvedFan() {
  const { viewer } = await getViewer();
  if (viewer?.role !== "fan" || viewer.status !== "approved") return null;
  return viewer.id;
}

const ticketSchema = z.object({ format: z.enum(["jpg", "heic"]) });

/** A signed upload URL for the new photo (straight to storage, never through us). */
export async function createPhotoUpload(
  input: z.infer<typeof ticketSchema>,
): Promise<{ path: string; token: string } | { error: PhotoError }> {
  const parsed = ticketSchema.safeParse(input);
  const userId = await approvedFan();
  if (!parsed.success || !userId) return { error: "failed" };
  if (!(await withinRateLimit(`upload:${userId}`, 40, 3600))) return { error: "rateLimited" };
  return (await createFanUpload(userId, parsed.data.format)) ?? { error: "failed" };
}

const photoSchema = z.object({ purpose: z.enum(["source", "profile"]), path: z.string().max(200) });

/**
 * source: convert a HEIC photo so the browser can show it in the crop tool.
 * profile: store the cropped photo and send it to admin review. The current
 * photo stays until an admin approves the new one.
 */
export async function processNewPhoto(
  input: z.infer<typeof photoSchema>,
): Promise<{ previewUrl: string } | { error: PhotoError }> {
  const parsed = photoSchema.safeParse(input);
  const userId = await approvedFan();
  if (!parsed.success || !userId) return { error: "failed" };
  const { purpose, path } = parsed.data;
  if (!isOwnUpload(userId, path)) return { error: "failed" };

  const clean = await cleanUpload(path);
  if (clean === null) return { error: "failed" };
  if (clean === "unreadable") return { error: "unreadable" };

  let preview: string;
  if (purpose === "source") {
    const sourcePath = await saveCropSource(userId, clean);
    if (!sourcePath) return { error: "failed" };
    preview = sourcePath;
    await removeFiles([path]);
  } else {
    const saved = await saveProfilePhoto(userId, clean);
    if (!saved) return { error: "failed" };
    const { data: replaced, error } = await createAdminClient().rpc("photo_change_submit", {
      p_user_id: userId,
      p_photo_path: saved.photoPath,
    });
    if (error) {
      await removeProfilePhoto(saved.photoPath);
      console.error("photo change failed", error.code);
      return { error: "failed" };
    }
    if (replaced) await removeProfilePhoto(replaced);
    await clearUploads(userId);
    preview = saved.thumbPath;
    refresh();
  }

  const url = await previewUrl(preview);
  return url ? { previewUrl: url } : { error: "failed" };
}
