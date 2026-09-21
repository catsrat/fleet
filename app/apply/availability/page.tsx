import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { AvailabilityForm } from "@/components/AvailabilityForm";
import { WEEKDAYS, WEEKDAYS_DE, daysPerWeek, formatMinute, weeklyMinutes } from "@/lib/availability";
import { dayStatus, eligibility, yearBounds } from "@/lib/compliance";
import { CAN_SET_AVAILABILITY, WERKSTUDENT_WEEKLY_HOURS } from "@/lib/constants";
import { db } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { requireRider } from "@/lib/session";
import { clearSlots, removeSlot } from "./actions";

export const metadata: Metadata = { title: "Availability" };

const DAY_MS = 86_400_000;

export default async function AvailabilityPage() {
  const user = await requireRider();
  const rider = user.rider;
  const locale = await getLocale();
  const d = t(locale).avail;

  if (!CAN_SET_AVAILABILITY.includes(rider.status)) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-bold tracking-tight">{d.title}</h1>
        <p className="card mt-5 px-5 py-8 text-sm text-slate-600">{d.locked}</p>
      </main>
    );
  }

  const today = new Date();
  const year = today.getUTCFullYear();
  const { start, end } = yearBounds(year);
  const [slots, docs, logs] = await Promise.all([
    db.availabilitySlot.findMany({ where: { riderId: rider.id }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    db.document.findMany({ where: { riderId: rider.id, status: { not: "SUPERSEDED" } } }),
    db.workLog.findMany({ where: { riderId: rider.id, date: { gte: start, lt: end } }, select: { hours: true } }),
  ]);

  const days = dayStatus(rider, logs.map((l) => l.hours), year);
  const elig = eligibility(rider, docs, days);
  const minutes = weeklyMinutes(slots);
  const daysWeek = daysPerWeek(slots);
  const weeksLeft = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / (7 * DAY_MS)));
  const projected = daysWeek * weeksLeft;

  const warnings: string[] = [];
  if (rider.employmentType === "WERKSTUDENT" && minutes > WERKSTUDENT_WEEKLY_HOURS * 60) warnings.push(d.warnHours);
  if (days.remaining !== null && projected > days.remaining) {
    warnings.push(d.warnDays.replace("{n}", String(projected)).replace("{left}", String(Math.max(0, days.remaining))));
  }

  const names = locale === "de" ? WEEKDAYS_DE : WEEKDAYS;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{d.title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{d.intro}</p>
      </div>

      {rider.status === "ACTIVE" && !elig.ok && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <p className="font-semibold text-rose-900">{d.notCleared}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-900">{elig.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          {warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}

      <section className="card p-5">
        <h2 className="mb-4 font-semibold">{d.addTitle}</h2>
        <AvailabilityForm text={{ daysLabel: d.daysLabel, days: d.days, from: d.from, to: d.to, quick: d.quick, presets: d.presets, add: d.add, saved: d.saved }} />
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <p className="font-semibold">
            {slots.length ? `${Math.round((minutes / 60) * 10) / 10} ${d.summary} ${daysWeek} ${d.summaryDays}` : d.title}
          </p>
          {slots.length > 0 && (
            <ActionForm action={clearSlots} submit={d.clearAll} pendingLabel="…" confirm={d.clearConfirm} buttonClass="text-sm font-medium text-rose-600 hover:underline">
              <span />
            </ActionForm>
          )}
        </div>
        {slots.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{d.empty}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {names.map((name, i) => {
              const day = slots.filter((s) => s.weekday === i + 1);
              return (
                <li key={name} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="w-28 text-sm font-medium text-slate-700">{name}</span>
                  {day.length === 0 ? (
                    <span className="text-sm text-slate-400">{d.none}</span>
                  ) : (
                    day.map((s) => (
                      <form key={s.id} action={removeSlot} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-sm font-semibold text-brand-800">
                        <input type="hidden" name="id" value={s.id} />
                        {formatMinute(s.startMinute)}–{formatMinute(s.endMinute)}
                        <button aria-label={`${d.remove} ${name} ${formatMinute(s.startMinute)}`} className="flex h-5 w-5 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200">×</button>
                      </form>
                    ))
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
