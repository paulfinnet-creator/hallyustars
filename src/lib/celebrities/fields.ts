import { z } from "zod";
import { SUPPORTED } from "@/i18n/config";

/** Profile categories (labels in messages: admin.celebrities.categories.*). */
export const CATEGORIES = ["kpop", "actor", "singer", "entertainer", "athlete", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const BIO_SOURCE_LOCALES = ["ko", "en"] as const;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

/** The editable profile fields, checked on the server (and mirrored by the form). */
export const profileSchema = z.object({
  stageName: z.string().trim().min(1).max(120),
  category: z.enum(CATEGORIES),
  groupName: z.string().trim().max(120).transform((v) => v || null),
  languages: z.array(z.enum(SUPPORTED)).max(SUPPORTED.length),
  timezone: z.string().max(64).refine(isTimeZone),
  acceptsInvites: z.boolean(),
});

export type ProfileInput = z.input<typeof profileSchema>;
