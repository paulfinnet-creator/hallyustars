import { describe, expect, it } from "vitest";
import { displayInvitationStatus, invitationMessageSchema, isWaiting } from "./status";

const now = new Date("2026-10-09T12:00:00Z");

describe("displayInvitationStatus", () => {
  it("shows a waiting invitation past its expiry as expired", () => {
    expect(displayInvitationStatus("pending", "2026-10-09T11:59:59Z", now)).toBe("expired");
    expect(displayInvitationStatus("pending", "2026-10-09T12:00:00Z", now)).toBe("expired");
    expect(isWaiting("pending", "2026-10-09T12:00:00Z", now)).toBe(false);
  });

  it("keeps everything else as stored", () => {
    expect(displayInvitationStatus("pending", "2026-10-10T00:00:00Z", now)).toBe("pending");
    expect(isWaiting("pending", "2026-10-10T00:00:00Z", now)).toBe(true);
    for (const status of ["approved", "rejected", "withdrawn", "expired"] as const) {
      expect(displayInvitationStatus(status, "2026-01-01T00:00:00Z", now)).toBe(status);
    }
  });
});

describe("invitationMessageSchema", () => {
  it("trims and limits the message", () => {
    expect(invitationMessageSchema.parse("  Hi!  ")).toBe("Hi!");
    expect(invitationMessageSchema.safeParse("   ").success).toBe(false);
    expect(invitationMessageSchema.safeParse("x".repeat(500)).success).toBe(true);
    expect(invitationMessageSchema.safeParse("x".repeat(501)).success).toBe(false);
  });
});
