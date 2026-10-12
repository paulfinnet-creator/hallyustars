import { describe, expect, it } from "vitest";
import { detectLocale, parseAcceptLanguage } from "./detect";

describe("detectLocale", () => {
  it("matches on the base language", () => {
    expect(detectLocale(["pt-BR"])).toBe("pt");
    expect(detectLocale(["fr-CA"])).toBe("fr");
    expect(detectLocale(["zh-Hant-TW"])).toBe("zh");
  });

  it("returns the first supported language in preference order", () => {
    expect(detectLocale(["xx", "ja", "ko"])).toBe("ja");
    expect(detectLocale(["sw-KE", "ar-EG", "en-US"])).toBe("ar");
  });

  it("is case-insensitive", () => {
    expect(detectLocale(["KO-kr"])).toBe("ko");
  });

  it("falls back to English", () => {
    expect(detectLocale([])).toBe("en");
    expect(detectLocale(["sw", "yo-NG"])).toBe("en");
  });
});

describe("parseAcceptLanguage", () => {
  it("orders by q-value, keeping header order for ties", () => {
    expect(parseAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8,de;q=0.9")).toEqual([
      "fr-CA",
      "fr",
      "de",
      "en",
    ]);
  });

  it("drops wildcards and q=0", () => {
    expect(parseAcceptLanguage("ko, *;q=0.5, ja;q=0")).toEqual(["ko"]);
  });

  it("handles missing headers", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
  });

  it("feeds detectLocale end to end", () => {
    expect(detectLocale(parseAcceptLanguage("sw;q=1, pt-BR;q=0.8, en;q=0.5"))).toBe("pt");
  });
});
