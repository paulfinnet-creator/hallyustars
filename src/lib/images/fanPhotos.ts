import "server-only";
import { randomUUID } from "node:crypto";
import { toCleanJpeg, toProfilePhoto, UnreadableImageError } from "@/lib/images/process";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A fan's own photos in the private bucket, shared by registration and
 * profile-photo changes. The browser uploads to <user>/uploads/ with a signed
 * URL; our server cleans each upload (HEIC → JPG, no metadata) and files it.
 * Never log these paths.
 */

export const FAN_PHOTO_BUCKET = "id-documents";
const PREVIEW_SECONDS = 600;

function storage() {
  return createAdminClient().storage.from(FAN_PHOTO_BUCKET);
}

/** A short-lived signed upload URL for one new file in the fan's uploads folder. */
export async function createFanUpload(userId: string, format: "jpg" | "heic") {
  const path = `${userId}/uploads/${randomUUID()}.${format}`;
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error) {
    console.error("signed upload URL failed", error.name);
    return null;
  }
  return { path, token: data.token };
}

/** Only the caller's own, just-uploaded files. */
export function isOwnUpload(userId: string, path: string) {
  return new RegExp(`^${userId}/uploads/[0-9a-f-]{36}\\.(jpg|heic)$`).test(path);
}

/**
 * Download an upload and return it as a clean JPG. The upload is removed if
 * it isn't a readable image; otherwise the caller removes it when done.
 */
export async function cleanUpload(path: string): Promise<Buffer | "unreadable" | null> {
  const { data: blob, error } = await storage().download(path);
  if (error) return null;
  try {
    return await toCleanJpeg(Buffer.from(await blob.arrayBuffer()));
  } catch (cause) {
    await storage().remove([path]);
    if (cause instanceof UnreadableImageError) return "unreadable";
    throw cause;
  }
}

export async function putJpeg(path: string, body: Buffer) {
  return !(await storage().upload(path, body, { contentType: "image/jpeg" })).error;
}

/** A HEIC photo converted so the browser can show it in the crop tool. */
export async function saveCropSource(userId: string, clean: Buffer): Promise<string | null> {
  const path = `${userId}/uploads/${randomUUID()}.jpg`;
  return (await putJpeg(path, clean)) ? path : null;
}

/** The cropped profile photo plus its 400×400 copy ("-400" before ".jpg"). */
export async function saveProfilePhoto(userId: string, clean: Buffer) {
  const { photo, thumb } = await toProfilePhoto(clean);
  const photoPath = `${userId}/profile-${randomUUID()}.jpg`;
  const thumbPath = photoPath.replace(/\.jpg$/, "-400.jpg");
  if (!(await putJpeg(photoPath, photo)) || !(await putJpeg(thumbPath, thumb))) return null;
  return { photoPath, thumbPath };
}

/** Delete a profile photo and its 400×400 copy. */
export async function removeProfilePhoto(photoPath: string) {
  await storage().remove([photoPath, photoPath.replace(/\.jpg$/, "-400.jpg")]);
}

export async function removeFiles(paths: string[]) {
  if (paths.length) await storage().remove(paths);
}

/** Leftover temporary files (abandoned uploads, HEIC copies made for cropping). */
export async function clearUploads(userId: string) {
  const { data: leftovers } = await storage().list(`${userId}/uploads`, { limit: 1000 });
  if (leftovers?.length) await storage().remove(leftovers.map((f) => `${userId}/uploads/${f.name}`));
}

/** A short-lived URL so the fan can see their own photo. */
export async function previewUrl(path: string): Promise<string | null> {
  const { data, error } = await storage().createSignedUrl(path, PREVIEW_SECONDS);
  return error ? null : data.signedUrl;
}
