export const SUPPORTED = [
  "en",
  "ko",
  "es",
  "de",
  "fr",
  "it",
  "th",
  "zh",
  "ja",
  "pl",
  "ru",
  "pt",
  "ar",
] as const;

export type Locale = (typeof SUPPORTED)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const RTL_LOCALES: readonly Locale[] = ["ar"];

/** Each language's name in its own script, for the language switcher. */
export const NATIVE_NAMES: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  th: "ไทย",
  zh: "中文",
  ja: "日本語",
  pl: "Polski",
  ru: "Русский",
  pt: "Português",
  ar: "العربية",
};

export function isLocale(value: string): value is Locale {
  return (SUPPORTED as readonly string[]).includes(value);
}

export function directionFor(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}
