"use client";

import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";
import { formatDate, formatFull } from "@/lib/time/format";

const subscribe = () => () => {};

/**
 * A UTC timestamp shown in the viewer's language and device timezone. The
 * server doesn't know the device timezone, so the text appears after hydration.
 */
export function LocalTime({
  iso,
  options,
}: {
  iso: string;
  options?: Intl.DateTimeFormatOptions;
}) {
  const locale = useLocale();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <time dateTime={iso} title={hydrated ? formatFull(iso, locale) : undefined}>
      {hydrated ? formatDate(iso, locale, options) : " "}
    </time>
  );
}
