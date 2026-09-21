const DATE = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const DATETIME = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
});

const DAY_BERLIN = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Berlin" });

/** For date-only values stored as UTC midnight (birth dates, expiry dates, work days). */
export const fmtDate = (d: Date | null | undefined): string => (d ? DATE.format(d) : "—");
/** For real moments in time (submitted, approved, assigned…): the calendar day in Berlin, not UTC. */
export const fmtDay = (d: Date | null | undefined): string => (d ? DAY_BERLIN.format(d) : "—");
export const fmtDateTime = (d: Date | null | undefined): string => (d ? DATETIME.format(d) : "—");

export function timeAgo(d: Date, now = new Date()): string {
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export const euro = (cents: number | null | undefined): string =>
  cents == null ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

export const humanize = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
