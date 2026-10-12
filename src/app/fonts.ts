import {
  IBM_Plex_Sans,
  IBM_Plex_Sans_KR,
  Noto_Naskh_Arabic,
  Noto_Sans_Arabic,
  Noto_Sans_JP,
  Noto_Sans_SC,
  Noto_Sans_Thai,
  Noto_Serif_JP,
  Noto_Serif_KR,
  Noto_Serif_SC,
  Noto_Serif_Thai,
} from "next/font/google";
import type { Locale } from "@/i18n/config";

// Every font is declared here because next/font must be called at module scope,
// but preload is off and only the active locale's classes reach <html>, so the
// browser downloads just the fonts for the script on screen.
// CJK and Hangul fonts are served in unicode-range slices without a named subset.

const headingKr = Noto_Serif_KR({
  subsets: ["latin", "cyrillic"],
  variable: "--hs-font-heading",
  display: "swap",
  preload: false,
});
const headingSc = Noto_Serif_SC({
  subsets: ["latin"],
  variable: "--hs-font-heading",
  display: "swap",
  preload: false,
});
const headingJp = Noto_Serif_JP({
  subsets: ["latin"],
  variable: "--hs-font-heading",
  display: "swap",
  preload: false,
});
const headingThai = Noto_Serif_Thai({
  subsets: ["thai", "latin"],
  variable: "--hs-font-heading",
  display: "swap",
  preload: false,
});
const headingArabic = Noto_Naskh_Arabic({
  subsets: ["arabic", "latin"],
  variable: "--hs-font-heading",
  display: "swap",
  preload: false,
});

const uiKr = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--hs-font-ui",
  display: "swap",
  preload: false,
});
const uiLatin = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--hs-font-ui",
  display: "swap",
  preload: false,
});
const uiSc = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--hs-font-ui",
  display: "swap",
  preload: false,
});
const uiJp = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--hs-font-ui",
  display: "swap",
  preload: false,
});
const uiThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--hs-font-ui",
  display: "swap",
  preload: false,
});
const uiArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--hs-font-ui",
  display: "swap",
  preload: false,
});

type FontPair = { heading: { variable: string }; ui: { variable: string } };

const LATIN: FontPair = { heading: headingKr, ui: uiLatin };

const FONTS: Record<Locale, FontPair> = {
  en: LATIN,
  es: LATIN,
  de: LATIN,
  fr: LATIN,
  it: LATIN,
  pl: LATIN,
  pt: LATIN,
  ru: LATIN,
  ko: { heading: headingKr, ui: uiKr },
  zh: { heading: headingSc, ui: uiSc },
  ja: { heading: headingJp, ui: uiJp },
  th: { heading: headingThai, ui: uiThai },
  ar: { heading: headingArabic, ui: uiArabic },
};

/** CSS-variable classes for <html> that define --hs-font-heading and --hs-font-ui. */
export function fontClassesFor(locale: Locale): string {
  const { heading, ui } = FONTS[locale];
  return `${heading.variable} ${ui.variable}`;
}
