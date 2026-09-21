import type { Document, Rider } from "@prisma/client";
import { db } from "./db";
import { EXPIRY_WARNING_DAYS, FULL_DAY_HOURS, STUDENT_DAY_LIMIT } from "./constants";
import { DOC_SPECS, type DocType } from "./documents";
import { daysUntil, isPast } from "./rider";

/** A day with more than 4 working hours is a full day, otherwise a half day. */
export const dayValue = (hours: number): number => (hours > FULL_DAY_HOURS ? 1 : 0.5);

export function yearBounds(year: number): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

/** Non-EU students without an unrestricted permit are capped at 140 full (280 half) days per calendar year. */
export function dayLimitFor(r: Pick<Rider, "nationalityGroup" | "workAuthorization">): number | null {
  return r.nationalityGroup === "NON_EU" && r.workAuthorization !== "UNRESTRICTED" ? STUDENT_DAY_LIMIT : null;
}

export interface DayStatus {
  limit: number | null;
  worked: number;
  prior: number;
  used: number;
  remaining: number | null;
  pct: number | null;
  level: "na" | "ok" | "warn" | "exceeded";
  priorStale: boolean;
}

export function dayStatus(
  rider: Pick<Rider, "nationalityGroup" | "workAuthorization" | "priorDaysWorked" | "priorDaysDeclaredAt">,
  hoursPerLoggedDay: number[],
  year = new Date().getFullYear(),
): DayStatus {
  const limit = dayLimitFor(rider);
  const worked = hoursPerLoggedDay.reduce((sum, h) => sum + dayValue(h), 0);
  const priorFresh = !!rider.priorDaysDeclaredAt && rider.priorDaysDeclaredAt.getUTCFullYear() === year;
  const prior = priorFresh ? rider.priorDaysWorked : 0;
  const priorStale = limit !== null && !priorFresh;
  const used = worked + prior;
  if (limit === null) return { limit, worked, prior, used, remaining: null, pct: null, level: "na", priorStale: false };
  const remaining = limit - used;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const level = remaining <= 0 ? "exceeded" : used >= limit * 0.8 ? "warn" : "ok";
  return { limit, worked, prior, used, remaining, pct, level, priorStale };
}

export async function loadHoursByRider(riderIds: string[], year = new Date().getFullYear()): Promise<Map<string, number[]>> {
  const { start, end } = yearBounds(year);
  const rows = await db.workLog.findMany({
    where: { riderId: { in: riderIds }, date: { gte: start, lt: end } },
    select: { riderId: true, hours: true },
  });
  const map = new Map<string, number[]>();
  for (const r of rows) map.set(r.riderId, [...(map.get(r.riderId) ?? []), r.hours]);
  return map;
}

export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface Eligibility {
  ok: boolean;
  reasons: string[];
  warnings: string[];
}

const WATCHED: DocType[] = ["ID_FRONT", "PERMIT_FRONT", "ENROLLMENT_CERT", "HEALTH_INSURANCE"];

/** Expiry is judged on the newest *approved* document, so a pending renewal never hides an expired original. */
function latestApproved(docs: Document[], type: DocType): Document | undefined {
  return docs
    .filter((d) => d.type === type && d.status === "APPROVED")
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
}

/** Whether an active rider may keep delivering right now, and what is about to lapse. */
export function eligibility(rider: Rider, docs: Document[], days: DayStatus, now = new Date()): Eligibility {
  const reasons: string[] = [];
  const warnings: string[] = [];

  for (const t of WATCHED) {
    if (t === "PERMIT_FRONT" && rider.nationalityGroup !== "NON_EU") continue;
    const label = DOC_SPECS[t].en.label;
    const doc = latestApproved(docs, t);
    const softOnly = t === "HEALTH_INSURANCE";
    if (!doc) {
      (softOnly ? warnings : reasons).push(`${label} not approved`);
    } else if (doc.expiresAt && isPast(doc.expiresAt, now)) {
      (softOnly ? warnings : reasons).push(`${label} expired`);
    } else if (doc.expiresAt) {
      const left = daysUntil(doc.expiresAt, now);
      if (left <= EXPIRY_WARNING_DAYS) warnings.push(`${label} expires in ${left} day${left === 1 ? "" : "s"}`);
    }
  }

  if (rider.workAuthorization === "NOT_PERMITTED") reasons.push("Residence permit does not allow employment");
  if (days.level === "exceeded") reasons.push(`Annual work-day limit reached (${days.used}/${days.limit})`);
  else if (days.level === "warn") warnings.push(`${days.remaining} work day(s) left of ${days.limit}`);
  if (days.priorStale) warnings.push("Prior work days not declared for this year");

  return { ok: reasons.length === 0, reasons, warnings };
}
