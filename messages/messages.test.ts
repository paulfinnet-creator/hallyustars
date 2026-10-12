import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SUPPORTED } from "@/i18n/config";

type Tree = { [key: string]: string | Tree };

function load(locale: string): Tree {
  return JSON.parse(readFileSync(new URL(`./${locale}.json`, import.meta.url), "utf8")) as Tree;
}

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );
}

const english = keys(load("en")).sort();

describe("message files", () => {
  it.each(SUPPORTED.filter((l) => l !== "en"))("%s has exactly the English keys", (locale) => {
    expect(keys(load(locale)).sort()).toEqual(english);
  });

  it.each(SUPPORTED)("%s has no empty strings", (locale) => {
    const tree = load(locale);
    const empty = keys(tree).filter((path) => {
      const value = path.split(".").reduce<string | Tree | undefined>(
        (node, k) => (typeof node === "object" ? node[k] : undefined),
        tree,
      );
      return typeof value !== "string" || value.trim() === "";
    });
    expect(empty).toEqual([]);
  });
});
