import { describe, expect, it } from "vitest";
import { countriesFromTimezones } from "./countries";

describe("countriesFromTimezones", () => {
  it("adds up the timezones of one country, largest first", () => {
    const result = countriesFromTimezones([
      { timezone: "America/New_York", count: 3 },
      { timezone: "Asia/Seoul", count: 5 },
      { timezone: "America/Los_Angeles", count: 4 },
    ]);
    expect(result.countries).toEqual([
      { code: "US", count: 7 },
      { code: "KR", count: 5 },
    ]);
  });

  it("knows old zone names and counts zones without a country as unknown", () => {
    const result = countriesFromTimezones([
      { timezone: "Asia/Calcutta", count: 2 },
      { timezone: "UTC", count: 6 },
    ]);
    expect(result.countries).toEqual([{ code: "IN", count: 2 }]);
    expect(result.unknown).toBe(6);
  });

  it("folds the smallest countries into other", () => {
    const result = countriesFromTimezones(
      [
        { timezone: "Asia/Seoul", count: 9 },
        { timezone: "Africa/Lagos", count: 5 },
        { timezone: "Europe/Paris", count: 2 },
        { timezone: "Europe/Berlin", count: 1 },
      ],
      2,
    );
    expect(result.countries.map((c) => c.code)).toEqual(["KR", "NG"]);
    expect(result.other).toBe(3);
  });
});
