import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { toCelebrityPhoto, toCleanJpeg, toProfilePhoto, UnreadableImageError } = await import("./process");

async function jpegWithGps(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#3f7a69" } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestPhone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 33/1 0/1" } })
    .toBuffer();
}

describe("toCleanJpeg", () => {
  it("converts HEIC to JPG", async () => {
    const heic = readFileSync(new URL("../../../e2e/fixtures/photo.heic", import.meta.url));
    const out = await toCleanJpeg(heic);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([900, 1200]);
  });

  it("strips EXIF and GPS metadata", async () => {
    const input = await jpegWithGps(800, 600);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const meta = await sharp(await toCleanJpeg(input)).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("shrinks the longest side to 2000 px and never enlarges", async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#fff" } }).png().toBuffer();
    expect((await sharp(await toCleanJpeg(big)).metadata()).width).toBe(2000);
    const small = await jpegWithGps(300, 200);
    expect((await sharp(await toCleanJpeg(small)).metadata()).width).toBe(300);
  });

  it("applies the EXIF orientation so the photo isn't sideways", async () => {
    const rotated = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#000" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const meta = await sharp(await toCleanJpeg(rotated)).metadata();
    expect([meta.width, meta.height]).toEqual([200, 400]);
  });

  it("refuses files that aren't JPG, PNG or HEIC", async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
    await expect(toCleanJpeg(gif)).rejects.toBeInstanceOf(UnreadableImageError);
    await expect(toCleanJpeg(Buffer.from("not an image"))).rejects.toBeInstanceOf(UnreadableImageError);
  });
});

describe("toProfilePhoto", () => {
  it("makes a square photo and a 400×400 copy", async () => {
    const { photo, thumb } = await toProfilePhoto(await jpegWithGps(1200, 900));
    const p = await sharp(photo).metadata();
    const t = await sharp(thumb).metadata();
    expect([p.width, p.height]).toEqual([900, 900]);
    expect([t.width, t.height]).toEqual([400, 400]);
  });
});

describe("toCelebrityPhoto", () => {
  it.each([
    [1500, 1500],
    [3000, 2000],
    [900, 2000],
    [1200, 1600],
  ])("makes a 3:4 portrait and a 450×600 card copy from %i×%i", async (w, h) => {
    const { photo, card } = await toCelebrityPhoto(await jpegWithGps(w, h));
    const p = await sharp(photo).metadata();
    const c = await sharp(card).metadata();
    expect(p.width! * 4).toBe(p.height! * 3);
    expect(p.width!).toBeLessThanOrEqual(1200);
    expect([c.width, c.height]).toEqual([450, 600]);
  });
});
