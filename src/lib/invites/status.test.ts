import { describe, expect, it } from "vitest";
import { canChangeInvite, displayInviteStatus } from "./status";

const now = new Date("2026-10-08T12:00:00Z");

describe("displayInviteStatus", () => {
  it("shows an unused invite past its expiry as expired", () => {
    expect(displayInviteStatus("created", "2026-10-08T11:59:59Z", now)).toBe("expired");
  });

  it("keeps an unused invite before its expiry as created", () => {
    expect(displayInviteStatus("created", "2026-10-08T12:00:01Z", now)).toBe("created");
  });

  it("doesn't expire an invite that is already in use", () => {
    expect(displayInviteStatus("registering", "2026-10-01T00:00:00Z", now)).toBe("registering");
  });
});

describe("canChangeInvite", () => {
  it.each(["created", "registering", "expired"] as const)("allows %s", (s) => {
    expect(canChangeInvite(s)).toBe(true);
  });

  it.each(["pending_review", "approved", "rejected", "revoked"] as const)("refuses %s", (s) => {
    expect(canChangeInvite(s)).toBe(false);
  });
});
