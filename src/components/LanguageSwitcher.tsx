"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { NATIVE_NAMES, SUPPORTED, type Locale } from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_COOKIE } from "@/i18n/routing";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** A manual choice always wins over browser detection (read in src/proxy.ts). */
function saveLocaleChoice(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

export function LanguageSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    saveLocaleChoice(next);
    startTransition(() => router.replace(pathname, { locale: next }));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${t("chooseLanguage")}: ${NATIVE_NAMES[locale]}`}
        disabled={isPending}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-ink hover:bg-band"
      >
        <GlobeIcon />
        <span>{NATIVE_NAMES[locale]}</span>
      </button>
      {open && (
        <ul
          id={menuId}
          aria-label={t("language")}
          className="absolute end-0 z-10 mt-2 max-h-80 w-44 overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {SUPPORTED.map((code) => (
            <li key={code}>
              <button
                type="button"
                lang={code}
                dir={code === "ar" ? "rtl" : "ltr"}
                onClick={() => choose(code)}
                className="w-full px-3 py-2 text-start text-sm text-ink hover:bg-band aria-[current=true]:font-semibold"
                aria-current={code === locale ? "true" : undefined}
              >
                {NATIVE_NAMES[code]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}
