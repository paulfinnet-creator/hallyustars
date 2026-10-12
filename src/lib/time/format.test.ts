import { describe, expect, it } from "vitest";
import {
  dayDividerLabel,
  formatDate,
  formatDuration,
  formatRelative,
  formatTimeInZone,
  startOfDayInZone,
} from "./format";

// 2026-10-04 14:40 UTC = 23:40 in Seoul, 15:40 in Lagos.
const NOW = new Date("2026-10-04T14:40:00Z");

describe("formatTimeInZone", () => {
  it("shows the other person's local time", () => {
    expect(formatTimeInZone("Asia/Seoul", "en", NOW)).toBe("11:40 PM");
    expect(formatTimeInZone("Africa/Lagos", "en", NOW)).toBe("3:40 PM");
  });
});

describe("formatRelative", () => {
  const zone = "Asia/Seoul";

  it("says just now under a minute", () => {
    expect(formatRelative("2026-10-04T14:39:30Z", "en", "Just now", NOW, zone)).toBe("Just now");
  });

  it("uses minutes under an hour", () => {
    expect(formatRelative("2026-10-04T14:35:00Z", "en", "Just now", NOW, zone)).toBe("5 min. ago");
  });

  it("shows time of day for earlier today", () => {
    expect(formatRelative("2026-10-04T01:00:00Z", "en", "Just now", NOW, zone)).toBe("10:00 AM");
  });

  it("shows the date for older messages", () => {
    expect(formatRelative("2026-09-30T01:00:00Z", "en", "Just now", NOW, zone)).toBe("Sep 30, 2026");
  });
});

describe("dayDividerLabel", () => {
  it("labels today and yesterday in the viewer's zone", () => {
    expect(dayDividerLabel("2026-10-04T00:30:00Z", "en", NOW, "Asia/Seoul")).toBe("Today");
    expect(dayDividerLabel("2026-10-03T12:00:00Z", "en", NOW, "Africa/Lagos")).toBe("Yesterday");
  });

  it("is localized", () => {
    expect(dayDividerLabel("2026-10-03T12:00:00Z", "ko", NOW, "Asia/Seoul")).toBe("어제");
  });

  it("uses weekday and date further back", () => {
    expect(dayDividerLabel("2026-09-28T12:00:00Z", "en", NOW, "Asia/Seoul")).toBe(
      "Monday, September 28, 2026",
    );
  });
});

describe("locale defaults", () => {
  it("uses the Buddhist calendar for Thai", () => {
    expect(formatDate("2026-10-04T12:00:00Z", "th", { year: "numeric" }, "Asia/Bangkok")).toContain(
      "2569",
    );
  });

  it("uses Eastern Arabic digits for Arabic by default", () => {
    expect(formatDate("2026-10-04T12:00:00Z", "ar-EG", { day: "numeric" }, "UTC")).toBe("٤");
  });
});

describe("startOfDayInZone", () => {
  it("finds midnight in the viewer's timezone", () => {
    expect(startOfDayInZone("2026-10-04", "Asia/Seoul").toISOString()).toBe("2026-10-03T15:00:00.000Z");
    expect(startOfDayInZone("2026-10-04", "Africa/Lagos").toISOString()).toBe("2026-10-03T23:00:00.000Z");
    expect(startOfDayInZone("2026-10-04", "UTC").toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("follows daylight saving time", () => {
    // New York: UTC-4 in summer, UTC-5 in winter.
    expect(startOfDayInZone("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(startOfDayInZone("2026-12-01", "America/New_York").toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });
});

describe("formatDuration", () => {
  it("picks minutes, hours or days", () => {
    expect(formatDuration(20, "en")).toBe("1 min");
    expect(formatDuration(12 * 60, "en")).toBe("12 min");
    expect(formatDuration(3.5 * 3600, "en")).toBe("3.5 hr");
    expect(formatDuration(3 * 86_400, "en")).toBe("3 days");
  });

  it("uses the site language", () => {
    expect(formatDuration(12 * 60, "ko")).toBe("12분");
  });
});
