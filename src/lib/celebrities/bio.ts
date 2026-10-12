import type { Locale } from "@/i18n/config";

export type BioRow = { locale: Locale; bio: string; isMachine: boolean };

/**
 * Which bio a fan sees: their own language if it exists, else the original,
 * else English, else any. `original` is set when the shown text is a machine
 * translation, so the page can offer "View original".
 */
export function pickBio(
  rows: readonly BioRow[],
  viewerLocale: Locale,
  sourceLocale: Locale | null,
): { shown: BioRow; original: BioRow | null } | null {
  const byLocale = new Map(rows.filter((r) => r.bio.trim()).map((r) => [r.locale, r]));
  const source = sourceLocale ? (byLocale.get(sourceLocale) ?? null) : null;
  const shown = byLocale.get(viewerLocale) ?? source ?? byLocale.get("en") ?? byLocale.values().next().value ?? null;
  if (!shown) return null;
  const original = shown.isMachine && source && source.locale !== shown.locale ? source : null;
  return { shown, original };
}
