import type { Locale } from "@/i18n/config";

// Used instead of ./fonts.ts under `next dev` only (next.config.ts aliases it).
// next dev gives each Google font download 3 seconds, and the CJK and Hangul
// fonts are about 1,000 files, so on a slow connection most time out and every
// page fails. Dev uses system fonts instead; builds still use the real fonts.

/** Same contract as fontClassesFor in ./fonts.ts: defines --hs-font-heading and --hs-font-ui. */
export function fontClassesFor(locale: Locale): string {
  void locale; // the browser picks the right system font for <html lang>
  return "hs-system-fonts";
}
