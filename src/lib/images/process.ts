import "server-only";
import convertHeic from "heic-convert";
import sharp from "sharp";
import { isHeicBytes, MAX_SIDE, MAX_UPLOAD_BYTES, THUMB_SIDE } from "./rules";

export class UnreadableImageError extends Error {}

/**
 * Turn an uploaded file into a clean JPG: HEIC converted (standard sharp
 * builds can't decode it), EXIF orientation applied, at most MAX_SIDE px,
 * and all metadata (EXIF, GPS) dropped. sharp writes no metadata unless asked.
 */
export async function toCleanJpeg(input: Buffer): Promise<Buffer> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new UnreadableImageError("too large");
  try {
    let source = input;
    if (isHeicBytes(new Uint8Array(input.subarray(0, 12)))) {
      source = Buffer.from(await convertHeic({ buffer: input, format: "JPEG", quality: 0.92 }));
    }
    const { format } = await sharp(source).metadata();
    if (format !== "jpeg" && format !== "png") throw new UnreadableImageError(`unsupported ${format}`);

    return await sharp(source)
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    if (error instanceof UnreadableImageError) throw error;
    throw new UnreadableImageError("decode failed");
  }
}

/** Profile photo: a centred square (the browser already cropped it) plus the 400×400 display copy. */
export async function toProfilePhoto(cleanJpeg: Buffer): Promise<{ photo: Buffer; thumb: Buffer }> {
  const { width = 0, height = 0 } = await sharp(cleanJpeg).metadata();
  const side = Math.min(width, height);
  const square = await sharp(cleanJpeg)
    .resize({ width: side, height: side, fit: "cover", position: "centre" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const thumb = await sharp(square)
    .resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: "cover" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return { photo: square, thumb };
}

/** Celebrity photocard: 3:4 portrait (the browser already cropped it), plus a card-size copy. */
export async function toCelebrityPhoto(cleanJpeg: Buffer): Promise<{ photo: Buffer; card: Buffer }> {
  // Largest centred 3:4 area, then shrink (never enlarge) to at most 1200×1600.
  const { width = 0, height = 0 } = await sharp(cleanJpeg).metadata();
  const cropW = Math.min(width, Math.floor((height * 3) / 4 / 3) * 3);
  const cropH = (cropW / 3) * 4;
  const photo = await sharp(cleanJpeg)
    .extract({ left: Math.floor((width - cropW) / 2), top: Math.floor((height - cropH) / 2), width: cropW, height: cropH })
    .resize({ width: Math.min(cropW, 1200), height: Math.min(cropH, 1600) })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const card = await sharp(photo)
    .resize({ width: 450, height: 600, fit: "cover" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return { photo, card };
}
