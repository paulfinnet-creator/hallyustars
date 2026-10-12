import { CATEGORIES, type Category } from "./fields";

/** Fan discovery: the search box and filters, read from the page URL. */

export const PAGE_SIZE = 24;
const MAX_QUERY = 100;
const MAX_TERMS = 8;

export type DiscoveryFilters = {
  q: string;
  category: Category | null;
  group: string | null;
  openOnly: boolean;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseDiscoveryParams(params: Params): DiscoveryFilters {
  const category = first(params.category);
  const group = first(params.group);
  const page = Number(first(params.page));
  return {
    q: first(params.q).slice(0, MAX_QUERY),
    category: (CATEGORIES as readonly string[]).includes(category) ? (category as Category) : null,
    group: group && group.length <= 120 ? group : null,
    openOnly: first(params.open) === "1",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function hasFilters(f: DiscoveryFilters): boolean {
  return Boolean(f.q || f.category || f.group || f.openOnly);
}

/** The filters as URL query values, without empty ones. */
export function toQuery(f: DiscoveryFilters, page = f.page): Record<string, string> {
  const query: Record<string, string> = {};
  if (f.q) query.q = f.q;
  if (f.category) query.category = f.category;
  if (f.group) query.group = f.group;
  if (f.openOnly) query.open = "1";
  if (page > 1) query.page = String(page);
  return query;
}

/**
 * A Postgres tsquery that matches names starting with each typed word, e.g.
 * "han demo" → "han:* & demo:*". Only letters and digits survive, so the
 * result can't carry tsquery operators. Null when nothing is left to search.
 */
export function toPrefixQuery(input: string): string | null {
  const terms = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter(Boolean)
    .slice(0, MAX_TERMS);
  return terms.length ? terms.map((t) => `${t}:*`).join(" & ") : null;
}
