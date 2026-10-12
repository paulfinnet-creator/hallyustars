/** Photo upload rules shared by the browser and the server (CLAUDE.md › Photo and ID uploads). */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Longest side of stored photos and ID images. */
export const MAX_SIDE = 2000;

/** Size of the square profile picture shown in the app. */
export const THUMB_SIDE = 400;

export const ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif";

export type PhotoKind = "jpeg" | "png" | "heic";

/**
 * What the browser says a file is. Chrome on Windows/Linux often reports an
 * empty type for HEIC, so the file extension is checked too. The server
 * checks the actual bytes again.
 */
export function photoKind(file: { name: string; type: string }): PhotoKind | null {
  const type = file.type.toLowerCase();
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (type === "image/jpeg" || (!type && (ext === "jpg" || ext === "jpeg"))) return "jpeg";
  if (type === "image/png" || (!type && ext === "png")) return "png";
  if (type === "image/heic" || type === "image/heif" || ext === "heic" || ext === "heif") return "heic";
  return null;
}

/** HEIF container brands used by iPhone photos (bytes 8–11 after "ftyp"). */
export function isHeicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const ftyp = String.fromCharCode(...bytes.subarray(4, 8));
  const brand = String.fromCharCode(...bytes.subarray(8, 12));
  return ftyp === "ftyp" && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand);
}
