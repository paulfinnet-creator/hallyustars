import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, SUPPORTED } from "./config";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export const routing = defineRouting({
  locales: SUPPORTED,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  // Unprefixed requests are resolved in src/proxy.ts (cookie, then
  // detectLocale()), so next-intl's own Accept-Language matching stays off.
  // LanguageSwitcher writes the cookie itself on a manual choice.
  localeDetection: false,
  localeCookie: {
    name: LOCALE_COOKIE,
    maxAge: 60 * 60 * 24 * 365,
  },
});
