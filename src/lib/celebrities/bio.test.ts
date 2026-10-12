import { describe, expect, it } from "vitest";
import { pickBio, type BioRow } from "./bio";

const ko: BioRow = { locale: "ko", bio: "안녕하세요", isMachine: false };
const en: BioRow = { locale: "en", bio: "Hello", isMachine: false };
const frMachine: BioRow = { locale: "fr", bio: "Bonjour", isMachine: true };
const frEdited: BioRow = { locale: "fr", bio: "Salut", isMachine: false };

describe("pickBio", () => {
  it("shows the viewer's language and offers the original for machine translations", () => {
    expect(pickBio([ko, en, frMachine], "fr", "ko")).toEqual({ shown: frMachine, original: ko });
  });

  it("offers no original for hand-edited translations or the original itself", () => {
    expect(pickBio([ko, frEdited], "fr", "ko")).toEqual({ shown: frEdited, original: null });
    expect(pickBio([ko, frMachine], "ko", "ko")).toEqual({ shown: ko, original: null });
  });

  it("falls back to the original, then English, then anything", () => {
    expect(pickBio([ko, en], "ja", "ko")?.shown).toBe(ko);
    expect(pickBio([en, frMachine], "ja", null)?.shown).toBe(en);
    expect(pickBio([frMachine], "ja", "ko")?.shown).toBe(frMachine);
  });

  it("ignores blank bios and returns null when there is none", () => {
    expect(pickBio([{ locale: "fr", bio: "  ", isMachine: true }, ko], "fr", "ko")?.shown).toBe(ko);
    expect(pickBio([], "en", null)).toBeNull();
  });
});
