// Builds src/lib/analytics/zoneCountries.json (IANA timezone → ISO country
// code) from the system tz database, for the admin Analytics "fan countries"
// list. Re-run after tzdata updates: node scripts/generate-zone-countries.mjs
import { readFileSync, writeFileSync } from "node:fs";

const ZONEINFO = process.env.ZONEINFO ?? "/usr/share/zoneinfo";
const map = {};
for (const line of readFileSync(`${ZONEINFO}/zone.tab`, "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const [country, , zone] = line.split("\t");
  map[zone] = country;
}
// Old names that link to a current zone (e.g. Asia/Calcutta → Asia/Kolkata).
for (const line of readFileSync(`${ZONEINFO}/tzdata.zi`, "utf8").split("\n")) {
  const [kind, target, alias] = line.split(" ");
  if (kind === "L" && map[target] && !map[alias]) map[alias] = map[target];
}
const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync("src/lib/analytics/zoneCountries.json", JSON.stringify(sorted, null, 0) + "\n");
console.log(`${Object.keys(sorted).length} zones`);
