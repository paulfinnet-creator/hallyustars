"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import {
  cleanUpload,
  clearUploads,
  createFanUpload,
  isOwnUpload,
  previewUrl,
  putJpeg,
  removeFiles,
  removeProfilePhoto,
  saveCropSource,
  saveProfilePhoto,
} from "@/lib/images/fanPhotos";
import { withinRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

// Photos and IDs stay in the private bucket until an admin approves the fan.

export type RegisterError = "unreadable" | "chooseIdType" | "incomplete" | "rateLimited" | "failed";

/** Only a signed-in fan who is still registering may upload or submit. */
async function registeringFan() {
  const { viewer } = await getViewer();
  if (viewer?.role !== "fan" || viewer.status !== "registering") return null;
  return viewer.id;
}

const ticketSchema = z.object({ format: z.enum(["jpg", "heic"]) });

/**
 * A short-lived signed URL so the browser uploads straight to storage
 * (Vercel functions reject request bodies over 4.5 MB).
 */
export async function createUpload(
  input: z.infer<typeof ticketSchema>,
): Promise<{ path: string; token: string } | { error: RegisterError }> {
  const parsed = ticketSchema.safeParse(input);
  const userId = await registeringFan();
  if (!parsed.success || !userId) return { error: "failed" };
  if (!(await withinRateLimit(`upload:${userId}`, 40, 3600))) return { error: "rateLimited" };
  return (await createFanUpload(userId, parsed.data.format)) ?? { error: "failed" };
}

const processSchema = z.object({
  purpose: z.enum(["source", "profile", "id"]),
  path: z.string().max(200),
  idType: z.enum(["passport", "national_id", "drivers_license"]).optional(),
});

/**
 * Turn an upload into a clean JPG (HEIC converted, metadata removed) and
 * file it:
 * - source: a HEIC photo converted so the browser can show it in the crop tool
 * - profile: the cropped profile photo plus its 400×400 copy
 * - id: the ID document
 * Returns a short-lived URL for the fan's own preview.
 */
export async function processUpload(
  input: z.infer<typeof processSchema>,
): Promise<{ previewUrl: string } | { error: RegisterError }> {
  const parsed = processSchema.safeParse(input);
  const userId = await registeringFan();
  if (!parsed.success || !userId) return { error: "failed" };
  const { purpose, path, idType } = parsed.data;
  if (!isOwnUpload(userId, path)) return { error: "failed" };
  if (purpose === "id" && !idType) return { error: "chooseIdType" };

  const clean = await cleanUpload(path);
  if (clean === null) return { error: "failed" };
  if (clean === "unreadable") return { error: "unreadable" };

  let previewPath: string | null;
  if (purpose === "source") {
    previewPath = await saveCropSource(userId, clean);
    if (!previewPath) return { error: "failed" };
  } else {
    const drafts = createAdminClient().from("registration_drafts");
    const { data: previous } = await drafts.select("*").eq("user_id", userId).maybeSingle();

    if (purpose === "profile") {
      const saved = await saveProfilePhoto(userId, clean);
      if (!saved) return { error: "failed" };
      previewPath = saved.thumbPath;
      const { error } = await drafts.upsert({ user_id: userId, profile_photo_path: saved.photoPath });
      if (error) return { error: "failed" };
      if (previous?.profile_photo_path) await removeProfilePhoto(previous.profile_photo_path);
    } else {
      previewPath = `${userId}/id-${randomUUID()}.jpg`;
      if (!(await putJpeg(previewPath, clean))) return { error: "failed" };
      const { error } = await drafts.upsert({ user_id: userId, id_document_path: previewPath, id_document_type: idType! });
      if (error) return { error: "failed" };
      if (previous?.id_document_path) await removeFiles([previous.id_document_path]);
    }
  }

  await removeFiles([path]);
  const url = await previewUrl(previewPath);
  return url ? { previewUrl: url } : { error: "failed" };
}

/** Send the finished registration to the admins' review queue. */
export async function submitRegistration(): Promise<{ ok: true } | { error: RegisterError }> {
  const userId = await registeringFan();
  if (!userId) return { error: "failed" };

  const admin = createAdminClient();
  const { error } = await admin.rpc("registration_submit", { p_user_id: userId });
  if (error) return { error: error.code === "22023" ? "incomplete" : "failed" };

  await clearUploads(userId);

  refresh();
  return { ok: true };
}
