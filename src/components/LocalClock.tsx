"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/time/format";
import { useNow } from "@/lib/time/useNow";

const subscribe = () => () => {};

/**
 * The current time in someone else's timezone, e.g. "Local time: 11:40 PM
 * Korean Standard Time". Rendered after hydration so it never shows a stale
 * server time.
 */
export function LocalClock({ timeZone }: { timeZone: string }) {
  const t = useTranslations("discover");
  const locale = useLocale();
  const now = useNow(30_000);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <p className="text-sm text-muted">
      {hydrated
        ? t("localTime", {
            time: formatDate(now, locale, { hour: "numeric", minute: "2-digit", timeZoneName: "long" }, timeZone),
          })
        : " "}
    </p>
  );
}
