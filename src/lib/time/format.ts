/**
 * The one place dates and times are formatted for display. Inputs are ISO UTC
 * strings from the server; output uses the active site locale and, unless a
 * zone is given, the device timezone.
 */

export type DateInput = string | Date;

function toDate(input: DateInput): Date {
  return typeof input === "string" ? new Date(input) : input;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Full date and time, e.g. for tooltips: "4 Oct 2026, 23:40 GMT+9". */
export function formatDate(
  input: DateInput,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(toDate(input));
}

/** Full date and time with the timezone name, for message tooltips. */
export function formatFull(input: DateInput, locale: string, timeZone?: string): string {
  return formatDate(
    input,
    locale,
    { dateStyle: "full", timeStyle: "long" },
    timeZone,
  );
}

/** Time of day only, e.g. "11:40 PM". */
export function formatTime(input: DateInput, locale: string, timeZone?: string): string {
  return formatDate(input, locale, { timeStyle: "short" }, timeZone);
}

/**
 * Label for a chat message: "Just now" under a minute (a translated string
 * passed in), "5 min ago" under an hour, time of day if today, else the date.
 */
export function formatRelative(
  input: DateInput,
  locale: string,
  justNow: string,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const date = toDate(input);
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return justNow;

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (diff < HOUR) return rtf.format(-Math.floor(diff / MINUTE), "minute");
  if (isSameDay(date, now, timeZone)) {
    return formatTime(date, locale, timeZone);
  }
  return formatDate(date, locale, { dateStyle: "medium" }, timeZone);
}

/** The local time somewhere else, e.g. "11:40 PM" in Asia/Seoul for the chat header. */
export function formatTimeInZone(timeZone: string, locale: string, now: Date = new Date()): string {
  return formatTime(now, locale, timeZone);
}

/** Calendar-day key (YYYY-MM-DD) of an instant in the given zone. */
function dayKey(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isSameDay(a: Date, b: Date, timeZone?: string): boolean {
  return dayKey(a, timeZone) === dayKey(b, timeZone);
}

/** Days between two calendar days in the given zone (b minus a). */
function calendarDayDiff(a: Date, b: Date, timeZone?: string): number {
  const toUtcMidnight = (d: Date) => Date.parse(`${dayKey(d, timeZone)}T00:00:00Z`);
  return Math.round((toUtcMidnight(b) - toUtcMidnight(a)) / DAY);
}

/**
 * Chat date-divider label: "Today", "Yesterday" (localized via
 * RelativeTimeFormat), then weekday + date.
 */
export function dayDividerLabel(
  input: DateInput,
  locale: string,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const date = toDate(input);
  const daysAgo = calendarDayDiff(date, now, timeZone);
  if (daysAgo === 0 || daysAgo === 1) {
    const label = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-daysAgo, "day");
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  }
  return formatDate(
    date,
    locale,
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
    timeZone,
  );
}

/** The device's IANA timezone, e.g. "Africa/Lagos". */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** How far `timeZone` is ahead of UTC at `instant`, in ms (DST-aware). */
function zoneOffset(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wallClock - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC instant a calendar day ("2026-10-04") starts in `timeZone`, for
 * date filters: midnight to midnight where the viewer is.
 */
export function startOfDayInZone(day: string, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const guess = Date.UTC(year!, month! - 1, date!);
  // Twice, in case the offset differs at the first estimate (DST change).
  const first = guess - zoneOffset(new Date(guess), timeZone);
  return new Date(guess - zoneOffset(new Date(first), timeZone));
}

/**
 * A length of time, e.g. a median response time: "12 min", "3.5 hr", "2 days".
 * Short units, in the active site locale.
 */
export function formatDuration(seconds: number, locale: string): string {
  const unit = (value: number, name: "minute" | "hour" | "day") =>
    new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "short", maximumFractionDigits: 1 }).format(value);
  if (seconds < HOUR / 1000) return unit(Math.max(1, Math.round(seconds / 60)), "minute");
  if (seconds < (2 * DAY) / 1000) return unit(seconds / 3600, "hour");
  return unit(seconds / 86_400, "day");
}
