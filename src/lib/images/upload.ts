"use client";

import { createClient } from "@/lib/supabase/client";

export type UploadTicket<E extends string> = { path: string; token: string } | { error: E };

/**
 * Upload straight to storage with a signed URL our server issued (Vercel
 * functions reject bodies over 4.5 MB, so files never pass through them).
 */
export async function uploadWithTicket<E extends string>(
  blob: Blob,
  format: "jpg" | "heic",
  getTicket: (input: { format: "jpg" | "heic" }) => Promise<UploadTicket<E>>,
  bucket: "id-documents" | "chat-images" = "id-documents",
): Promise<{ path: string } | { error: E | "failed" }> {
  const ticket = await getTicket({ format });
  if ("error" in ticket) return ticket;
  const { error } = await createClient()
    .storage.from(bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, blob, {
      contentType: format === "heic" ? "image/heic" : "image/jpeg",
    });
  return error ? { error: "failed" } : { path: ticket.path };
}

/** JPG/PNG: resize in the browser to at most `maxSide` px and re-encode as JPG. */
export async function resizedJpeg(file: Blob, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.9),
  );
}
