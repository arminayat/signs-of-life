import { formatInTimeZone } from "date-fns-tz";
export function localDay(now: Date, timezone: string) {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
}
// Calendar arithmetic uses UTC only as a representation of date labels. It
// must not subtract 24-hour durations from local instants across DST changes.
export function calendarRange(now: Date, timezone: string, days: number) {
  const to = localDay(now, timezone);
  const from = new Date(Date.parse(to) - (days - 1) * 86400_000)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}
export function validateCalendarRange(
  range: { from: string; to: string },
  now: Date,
  timezone: string,
  maxDays = 365,
) {
  const isDate = (value: string) => {
    const parsed = new Date(value);
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  };
  const bounds = calendarRange(now, timezone, maxDays);
  return (
    isDate(range.from) &&
    isDate(range.to) &&
    bounds.from <= range.from &&
    range.from <= range.to &&
    range.to <= bounds.to
  );
}
export function dailyReady(now: Date, timezone: string, time: string) {
  return formatInTimeZone(now, timezone, "HH:mm") >= time;
}
export function reportingDates(now: Date, days = 7): string[] {
  return Array.from({ length: days }, (_, index) =>
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - index - 1,
      ),
    )
      .toISOString()
      .slice(0, 10),
  );
}
export function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export function shortAccount(id: string) {
  return id.slice(0, 8);
}
