import zoneCountries from "./zoneCountries.json";

const ZONES: Record<string, string> = zoneCountries;

export type CountryCount = { code: string | null; count: number };

/**
 * Fan counts per country from counts per saved timezone (a timezone belongs
 * to one country in the tz database). Zones without a country (e.g. "UTC")
 * count as unknown (code null). Largest first; past `limit` countries the
 * rest are folded into "other" so the list stays readable.
 */
export function countriesFromTimezones(
  rows: { timezone: string; count: number }[],
  limit = 8,
): { countries: CountryCount[]; other: number; unknown: number } {
  const byCountry = new Map<string, number>();
  let unknown = 0;
  for (const { timezone, count } of rows) {
    const code = ZONES[timezone];
    if (code) byCountry.set(code, (byCountry.get(code) ?? 0) + count);
    else unknown += count;
  }
  const sorted = [...byCountry.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  const other = sorted.slice(limit).reduce((sum, c) => sum + c.count, 0);
  return { countries: sorted.slice(0, limit), other, unknown };
}
