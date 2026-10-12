import { describe, expect, it } from "vitest";
import {
  lastSeenMessageId,
  mergeMessages,
  placeFromTimeZone,
  summarizeReactions,
  toChatMessage,
  type ChatMessage,
} from "./messages";

const msg = (id: string, senderId: string, createdAt: string): ChatMessage => ({
  id,
  senderId,
  body: id,
  attachments: [],
  createdAt,
  deleted: false,
});

describe("toChatMessage", () => {
  it("keeps only well-formed image attachments", () => {
    const m = toChatMessage({
      id: "1",
      sender_id: "a",
      body: "",
      attachments: [{ type: "image", path: "c/x.jpg", width: 10, height: 20 }, { type: "file", path: "y" }, "z"],
      created_at: "2026-10-09T10:00:00Z",
      deleted_at: null,
    });
    expect(m.attachments).toEqual([{ type: "image", path: "c/x.jpg", width: 10, height: 20 }]);
  });

  it("hides the content of deleted messages", () => {
    const m = toChatMessage({
      id: "1",
      sender_id: "a",
      body: "secret",
      attachments: [{ type: "image", path: "c/x.jpg", width: 1, height: 1 }],
      created_at: "2026-10-09T10:00:00Z",
      deleted_at: "2026-10-09T11:00:00Z",
    });
    expect(m).toMatchObject({ body: "", attachments: [], deleted: true });
  });
});

describe("mergeMessages", () => {
  it("dedupes by id and sorts by time", () => {
    const a = msg("a", "x", "2026-10-09T10:00:00Z");
    const b = msg("b", "x", "2026-10-09T09:00:00Z");
    expect(mergeMessages([a], [b, { ...a, body: "edited" }]).map((m) => [m.id, m.body])).toEqual([
      ["b", "b"],
      ["a", "edited"],
    ]);
  });
});

describe("summarizeReactions", () => {
  it("counts per emoji in a fixed order and marks mine", () => {
    const reactions = [
      { messageId: "m", userId: "them", emoji: "👍" },
      { messageId: "m", userId: "me", emoji: "❤️" },
      { messageId: "m", userId: "them", emoji: "❤️" },
      { messageId: "other", userId: "me", emoji: "😂" },
    ];
    expect(summarizeReactions(reactions, "m", "me")).toEqual([
      { emoji: "❤️", count: 2, byMe: true },
      { emoji: "👍", count: 1, byMe: false },
    ]);
  });
});

describe("lastSeenMessageId", () => {
  const list = [
    msg("1", "me", "2026-10-09T10:00:00Z"),
    msg("2", "them", "2026-10-09T10:01:00Z"),
    msg("3", "me", "2026-10-09T10:02:00Z"),
    msg("4", "me", "2026-10-09T10:05:00Z"),
  ];

  it("is my latest message sent before the other person last read", () => {
    expect(lastSeenMessageId(list, "me", "2026-10-09T10:03:00Z")).toBe("3");
    expect(lastSeenMessageId(list, "me", "2026-10-09T10:05:00Z")).toBe("4");
  });

  it("is null when they haven't read anything of mine", () => {
    expect(lastSeenMessageId(list, "me", null)).toBeNull();
    expect(lastSeenMessageId(list, "me", "2026-10-09T09:00:00Z")).toBeNull();
  });
});

describe("placeFromTimeZone", () => {
  it("uses the city part of the zone", () => {
    expect(placeFromTimeZone("Asia/Seoul")).toBe("Seoul");
    expect(placeFromTimeZone("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(placeFromTimeZone("UTC")).toBe("UTC");
  });
});
