import { describe, expect, it } from "vitest";
import { profileSchema } from "./fields";

const valid = {
  stageName: " Haneul ",
  category: "kpop",
  groupName: "",
  languages: ["ko", "en"],
  timezone: "Asia/Seoul",
  acceptsInvites: true,
};

describe("profileSchema", () => {
  it("trims names and turns an empty group into null", () => {
    expect(profileSchema.parse(valid)).toMatchObject({ stageName: "Haneul", groupName: null });
  });

  it.each([
    ["an empty stage name", { stageName: "  " }],
    ["an unknown category", { category: "influencer" }],
    ["an unsupported language", { languages: ["ko", "xx"] }],
    ["a fixed offset instead of a zone", { timezone: "+09:00" }],
    ["an unknown zone", { timezone: "Mars/Olympus" }],
  ])("refuses %s", (_, change) => {
    expect(profileSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});
