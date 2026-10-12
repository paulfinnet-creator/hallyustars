"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { formatFull, formatRelative } from "@/lib/time/format";
import { useNow } from "@/lib/time/useNow";

const subscribe = () => () => {};

/**
 * "Just now" / "5 min ago" / time of day / date, refreshed every minute, with
 * the full date and time in a tooltip. Device timezone, so rendered after hydration.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const now = useNow();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <time dateTime={iso} title={hydrated ? formatFull(iso, locale) : undefined}>
      {hydrated ? formatRelative(iso, locale, t("justNow"), now) : " "}
    </time>
  );
}
