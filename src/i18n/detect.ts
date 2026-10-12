import { DEFAULT_LOCALE, SUPPORTED, type Locale } from "./config";

/**
 * Walk the browser's ordered preference list and pick the first supported
 * language, matching on the base language (pt-BR → pt). Falls back to en.
 */
export function detectLocale(browserLangs: readonly string[]): Locale {
  for (const lang of browserLangs) {
    const base = lang.toLowerCase().split("-")[0] ?? "";
    if ((SUPPORTED as readonly string[]).includes(base)) return base as Locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Turn an Accept-Language header into an ordered list of language tags,
 * highest q-value first. Ties keep header order; q=0 entries are dropped.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim(), q: Number.isNaN(q) ? 0 : q, index };
    })
    .filter(({ tag, q }) => tag !== "" && tag !== "*" && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(({ tag }) => tag);
}
