// Money and date formatting. Money is integer cents in app code (never floats);
// dates and times are shown in the business timezone.

import { BUSINESS_TIMEZONE } from "./config.ts";

/** Parse a decimal money string from Postgres ("195.00", "87.5") into integer cents. */
export function toCents(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid money value: ${value}`);
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Integer cents to a decimal string for Postgres ("195.00"). */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Invalid cents: ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/**
 * GST in cents, rounded half up like Postgres round(x, 2) on positive numbers.
 * Display only: place_order computes the charged amount.
 */
export function gstCents(amountCents: number, gstBasisPoints: number): number {
  return Math.floor((amountCents * gstBasisPoints + 5_000) / 10_000);
}

const wholeDollars = new Intl.NumberFormat("en-SG", { maximumFractionDigits: 0 });

/** "$1,234.50" */
export function formatMoney(cents: number): string {
  const [whole, fraction] = centsToDecimal(cents).split(".");
  return `$${wholeDollars.format(Number(whole))}.${fraction}`;
}

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
});

// ICU versions differ in which space they put around "–" and before "PM" (narrow no-break, thin,
// regular), so Node and the browser can disagree and break hydration. Use plain spaces.
const plainSpaces = (text: string) => text.replace(/[\u00a0\u2009\u202f]/g, " ");

/** "5:00 – 6:30 PM" for a delivery window. */
export function formatWindow(start: string | Date, end: string | Date): string {
  return plainSpaces(timeFormat.formatRange(new Date(start), new Date(end)));
}

/** "5:20 PM" */
export function formatTime(value: string | Date): string {
  return plainSpaces(timeFormat.format(new Date(value)));
}

const instantDateFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: BUSINESS_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Thu, 24 Dec" for an instant, in the business timezone. */
export function formatDateOf(value: string | Date): string {
  return instantDateFormat.format(new Date(value));
}

const serviceDateFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "UTC", // service_date is a calendar date, not an instant
  weekday: "short",
  day: "numeric",
  month: "short",
});

const serviceDateWithYearFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "Fri, 27 Nov" (or "Wed, 24 Dec 2025" with `withYear`) for a "YYYY-MM-DD" business date. */
export function formatServiceDate(date: string, { withYear = false } = {}): string {
  return (withYear ? serviceDateWithYearFormat : serviceDateFormat).format(new Date(`${date}T00:00:00Z`));
}

const dateRangeFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "8 – 21 Nov 2026" or "28 Dec 2025 – 10 Jan 2026" for two "YYYY-MM-DD" business dates. */
export function formatServiceDateRange(from: string, to: string): string {
  return plainSpaces(dateRangeFormat.formatRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`)));
}

const dayMonthFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

/** Short season label for a seasonal menu item: "27 Nov – 3 Jan" (no years). */
export function formatSeason(from: string, to: string): string {
  const day = (date: string) => dayMonthFormat.format(new Date(`${date}T00:00:00Z`));
  return `${day(from)} – ${day(to)}`;
}
