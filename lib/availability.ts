// Weekly availability, in Europe/Berlin local time. weekday: 1 = Monday … 7 = Sunday; minutes since midnight.
export interface Slot {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/** Deliveries run in the day and evening; night work carries extra legal duties, so slots stay inside this window. */
export const DAY_START = 6 * 60;
export const DAY_END = 24 * 60;
export const MIN_SLOT_MINUTES = 60;
/** Arbeitszeitgesetz: 8 h a day, up to 10 h with compensation; 11 h uninterrupted rest between working days. */
export const MAX_DAILY_MINUTES = 10 * 60;
export const MIN_REST_MINUTES = 11 * 60;

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WEEKDAYS_DE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;

export const formatMinute = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && minutes <= 1440 ? minutes : null;
}

/** Joins overlapping or touching slots on the same weekday, so 17–20 plus 20–22 becomes 17–22. */
export function mergeSlots(slots: Slot[]): Slot[] {
  const out: Slot[] = [];
  const sorted = [...slots].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && last.weekday === s.weekday && s.startMinute <= last.endMinute) last.endMinute = Math.max(last.endMinute, s.endMinute);
    else out.push({ ...s });
  }
  return out;
}

export function validateSlot(s: Slot): string | null {
  if (!Number.isInteger(s.weekday) || s.weekday < 1 || s.weekday > 7) return "Choose a valid weekday.";
  if (s.startMinute < DAY_START || s.endMinute > DAY_END) return `Slots must be between ${formatMinute(DAY_START)} and 24:00.`;
  if (s.endMinute - s.startMinute < MIN_SLOT_MINUTES) return "A slot must be at least 1 hour long.";
  return null;
}

export function dailyMinutes(slots: Slot[], weekday: number): number {
  return slots.filter((s) => s.weekday === weekday).reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);
}

/** Hard limits that reject the whole week: daily maximum and the 11 h rest between one day's last slot and the next day's first. */
export function validateWeek(slots: Slot[], locale: "en" | "de" = "en"): string | null {
  const de = locale === "de";
  const names = de ? WEEKDAYS_DE : WEEKDAYS;
  for (let d = 1; d <= 7; d++) {
    if (dailyMinutes(slots, d) > MAX_DAILY_MINUTES) {
      return de ? `${names[d - 1]}: maximal 10 Stunden pro Tag.` : `${names[d - 1]}: at most 10 hours in one day.`;
    }
  }
  for (let d = 1; d <= 7; d++) {
    const today = slots.filter((s) => s.weekday === d);
    const next = slots.filter((s) => s.weekday === (d % 7) + 1);
    if (!today.length || !next.length) continue;
    const lastEnd = Math.max(...today.map((s) => s.endMinute));
    const nextStart = Math.min(...next.map((s) => s.startMinute));
    const rest = 1440 - lastEnd + nextStart;
    if (rest < MIN_REST_MINUTES) {
      const from = names[d - 1];
      const to = names[d % 7];
      return de
        ? `Zwischen ${from} (Ende ${formatMinute(lastEnd)}) und ${to} (Beginn ${formatMinute(nextStart)}) liegen nur ${Math.floor(rest / 60)} Stunden Ruhezeit – gesetzlich sind 11 nötig.`
        : `Only ${Math.floor(rest / 60)} h rest between ${from} (ends ${formatMinute(lastEnd)}) and ${to} (starts ${formatMinute(nextStart)}); 11 h are required by law.`;
    }
  }
  return null;
}

export const weeklyMinutes = (slots: Slot[]): number => slots.reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);
export const daysPerWeek = (slots: Slot[]): number => new Set(slots.map((s) => s.weekday)).size;

/** The current weekday (1 = Monday) and minute of day in Berlin, regardless of where the server runs. */
export function berlinNow(now = new Date()): { weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { weekday, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function slotAt(slots: Slot[], weekday: number, minute: number): Slot | undefined {
  return slots.find((s) => s.weekday === weekday && minute >= s.startMinute && minute < s.endMinute);
}

/** Slots that begin within the next `withinMinutes` minutes (today only). */
export function startingSoon(slots: Slot[], now: { weekday: number; minute: number }, withinMinutes: number): Slot[] {
  return slots.filter((s) => s.weekday === now.weekday && s.startMinute > now.minute && s.startMinute - now.minute <= withinMinutes);
}

export function endingSoon(slots: Slot[], now: { weekday: number; minute: number }, withinMinutes: number): Slot[] {
  return slots.filter((s) => s.weekday === now.weekday && s.startMinute <= now.minute && s.endMinute > now.minute && s.endMinute - now.minute <= withinMinutes);
}

export interface GoOnlineStatus {
  allowed: boolean;
  reasons: string[];
}

/**
 * Whether this rider should be online right now: cleared to ride (documents valid, day limit not reached,
 * account active) AND inside a slot they set themselves. This is the rule an enforcement mechanism should follow.
 */
export function goOnlineStatus(input: { active: boolean; clearedToRide: boolean; notClearedReasons: string[]; slots: Slot[] }, now = berlinNow()): GoOnlineStatus {
  const reasons: string[] = [];
  if (!input.active) reasons.push("Account is not active");
  if (!input.clearedToRide) reasons.push(...input.notClearedReasons);
  if (!input.slots.length) reasons.push("No availability set");
  else if (!slotAt(input.slots, now.weekday, now.minute)) reasons.push("Outside their availability");
  return { allowed: reasons.length === 0, reasons };
}
