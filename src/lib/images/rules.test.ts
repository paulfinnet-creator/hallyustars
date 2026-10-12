import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isHeicBytes, photoKind } from "./rules";

describe("photoKind", () => {
  it.each([
    [{ name: "me.jpg", type: "image/jpeg" }, "jpeg"],
    [{ name: "me.PNG", type: "image/png" }, "png"],
    [{ name: "IMG_0001.HEIC", type: "image/heic" }, "heic"],
    [{ name: "IMG_0001.heic", type: "" }, "heic"],
    [{ name: "photo.heif", type: "image/heif" }, "heic"],
    [{ name: "scan.jpeg", type: "" }, "jpeg"],
  ])("%j → %s", (file, kind) => {
    expect(photoKind(file)).toBe(kind);
  });

  it.each([
    { name: "doc.pdf", type: "application/pdf" },
    { name: "anim.gif", type: "image/gif" },
    { name: "pic.webp", type: "image/webp" },
    { name: "noext", type: "" },
  ])("refuses %j", (file) => {
    expect(photoKind(file)).toBeNull();
  });
});

describe("isHeicBytes", () => {
  it("recognises a real HEIC file", () => {
    const bytes = readFileSync(new URL("../../../e2e/fixtures/photo.heic", import.meta.url));
    expect(isHeicBytes(new Uint8Array(bytes))).toBe(true);
  });

  it("does not mistake a JPEG for HEIC", () => {
    expect(isHeicBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]))).toBe(false);
  });
});
