import { formatInTimeZone } from "date-fns-tz";
export function localDay(now: Date, timezone: string) {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
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
