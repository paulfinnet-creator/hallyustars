import { describe, expect, it } from "vitest";
import { formatInviteCode, inviteLink, normalizeInviteCode } from "./code";

describe("normalizeInviteCode", () => {
  it.each([
    ["SKCE-7K4M-Q2PX", "SKCE7K4MQ2PX"],
    ["skce-7k4m-q2px", "SKCE7K4MQ2PX"],
    [" 7K4M Q2PX ", "SKCE7K4MQ2PX"],
    ["7k4m-q2px", "SKCE7K4MQ2PX"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeInviteCode(input)).toBe(expected);
  });

  it.each(["SKCE-0K4M-Q2PX", "SKCE-1K4M-Q2PX", "SKCE-LK4M-Q2PX", "SKCE-7K4", "", "SKCE-7K4M-Q2PX-9"])(
    "rejects %j",
    (input) => {
      expect(normalizeInviteCode(input)).toBeNull();
    },
  );
});

describe("formatInviteCode", () => {
  it("adds dashes", () => {
    expect(formatInviteCode("SKCE7K4MQ2PX")).toBe("SKCE-7K4M-Q2PX");
  });

  it("refuses anything that isn't a stored code", () => {
    expect(() => formatInviteCode("SKCE-7K4M-Q2PX")).toThrow();
  });
});

describe("inviteLink", () => {
  it("builds the shareable link without a locale", () => {
    expect(inviteLink("https://hallyustars.org", "SKCE7K4MQ2PX")).toBe(
      "https://hallyustars.org/invite/SKCE-7K4M-Q2PX",
    );
  });
});
