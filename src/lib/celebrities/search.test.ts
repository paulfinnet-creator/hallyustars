import { describe, expect, it } from "vitest";
import { hasFilters, parseDiscoveryParams, toPrefixQuery, toQuery } from "./search";

describe("toPrefixQuery", () => {
  it("matches the start of each word", () => {
    expect(toPrefixQuery("Han Demo")).toBe("han:* & demo:*");
  });

  it("keeps Korean, Japanese, Thai and Arabic letters", () => {
    expect(toPrefixQuery("하늘")).toBe("하늘:*");
    expect(toPrefixQuery("少女時代")).toBe("少女時代:*");
    expect(toPrefixQuery("สวัสดี")).toBe("สวัสดี:*");
    expect(toPrefixQuery("نجم")).toBe("نجم:*");
  });

  it("drops tsquery operators and punctuation", () => {
    expect(toPrefixQuery("a & b | !c :* (d) 'e'")).toBe("a:* & b:* & c:* & d:* & e:*");
    expect(toPrefixQuery("Demo-Group")).toBe("demo:* & group:*");
  });

  it("returns null when nothing searchable is left", () => {
    expect(toPrefixQuery("")).toBeNull();
    expect(toPrefixQuery("  &|!  ")).toBeNull();
  });

  it("limits the number of words", () => {
    expect(toPrefixQuery("a b c d e f g h i j")?.split(" & ")).toHaveLength(8);
  });
});

describe("parseDiscoveryParams", () => {
  it("reads valid filters", () => {
    expect(parseDiscoveryParams({ q: " haneul ", category: "kpop", group: "Demo Group", open: "1", page: "3" })).toEqual({
      q: "haneul",
      category: "kpop",
      group: "Demo Group",
      openOnly: true,
      page: 3,
    });
  });

  it("ignores unknown or malformed values", () => {
    const f = parseDiscoveryParams({ category: "royalty", group: "x".repeat(121), open: "yes", page: "-2" });
    expect(f).toEqual({ q: "", category: null, group: null, openOnly: false, page: 1 });
    expect(hasFilters(f)).toBe(false);
  });

  it("takes the first of repeated parameters", () => {
    expect(parseDiscoveryParams({ q: ["one", "two"] }).q).toBe("one");
  });

  it("round-trips through toQuery", () => {
    const f = parseDiscoveryParams({ q: "han", open: "1", page: "2" });
    expect(toQuery(f)).toEqual({ q: "han", open: "1", page: "2" });
    expect(toQuery(f, 1)).toEqual({ q: "han", open: "1" });
  });
});
