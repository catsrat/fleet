import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Stat } from "@/components/admin-ui";
import { WEEKDAYS, berlinNow, endingSoon, formatMinute, goOnlineStatus, slotAt, startingSoon, type Slot } from "@/lib/availability";
import { dayStatus, eligibility, loadHoursByRider } from "@/lib/compliance";
import { db } from "@/lib/db";
import { fullName } from "@/lib/rider";
import { requireStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Schedule" };

const FIRST_HOUR = 6;
const LAST_HOUR = 23;

/** Minutes of overlap between a slot and the hour starting at `hour`. */
const overlap = (s: Slot, hour: number) => Math.min(s.endMinute, (hour + 1) * 60) - Math.max(s.startMinute, hour * 60);

export default async function SchedulePage() {
  await requireStaff();
  const riders = await db.rider.findMany({
    where: { status: { in: ["APPROVED", "UBER_ONBOARDING", "ACTIVE"] } },
    include: { slots: true, documents: { where: { status: { not: "SUPERSEDED" } } } },
    orderBy: { lastName: "asc" },
  });
  const hours = await loadHoursByRider(riders.map((r) => r.id));
  const now = berlinNow();

  const rows = riders.map((rider) => {
    const days = dayStatus(rider, hours.get(rider.id) ?? []);
    const elig = eligibility(rider, rider.documents, days);
    const status = goOnlineStatus({ active: rider.status === "ACTIVE", clearedToRide: elig.ok, notClearedReasons: elig.reasons, slots: rider.slots }, now);
    return { rider, elig, status, slots: rider.slots as Slot[] };
  });

  const active = rows.filter((r) => r.rider.status === "ACTIVE");
  const inSlotNow = rows.filter((r) => slotAt(r.slots, now.weekday, now.minute));
  const shouldBeOnline = inSlotNow.filter((r) => r.status.allowed);
  const blockedNow = inSlotNow.filter((r) => !r.status.allowed);
  const noAvailability = active.filter((r) => r.slots.length === 0);
  const starting = rows.filter((r) => startingSoon(r.slots, now, 60).length > 0);
  const ending = rows.filter((r) => endingSoon(r.slots, now, 30).length > 0);

  const coverage = Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) =>
      active.filter((r) => r.elig.ok && r.slots.some((s) => s.weekday === d + 1 && overlap(s, FIRST_HOUR + i) >= 30)).length,
    ),
  );
  const peak = Math.max(1, ...coverage.flat());

  return (
    <>
      <PageHeader title="Schedule" subtitle={`Berlin time · ${WEEKDAYS[now.weekday - 1]} ${formatMinute(now.minute)}. Built from the hours riders set themselves.`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Should be online now" value={shouldBeOnline.length} tone="good" hint="In their own slot and cleared to ride" />
        <Stat label="In a slot but blocked" value={blockedNow.length} tone={blockedNow.length ? "warn" : "good"} hint="Should stay offline" />
        <Stat label="Active, no availability set" value={noAvailability.length} tone={noAvailability.length ? "warn" : "good"} />
        <Stat label="Riders with availability" value={`${rows.filter((r) => r.slots.length).length} / ${rows.length}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Actions for your team</h2>
            <p className="mt-0.5 text-sm text-slate-500">Who to enable or disable in the Uber fleet tools around now.</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {starting.map(({ rider, status, slots }) => (
              <li key={`s-${rider.id}`} className="flex items-start justify-between gap-3 px-5 py-3">
                <div>
                  <Link href={`/admin/riders/${rider.id}`} className="text-sm font-semibold hover:text-brand-700">{fullName(rider)}</Link>
                  <p className="text-xs text-slate-500">Slot starts {formatMinute(startingSoon(slots, now, 60)[0].startMinute)}</p>
                  {!status.allowed && status.reasons.filter((r) => r !== "Outside their availability").map((r) => <p key={r} className="text-xs font-medium text-rose-600">{r}</p>)}
                </div>
                <span className={`chip shrink-0 ${status.reasons.every((r) => r === "Outside their availability") ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                  {status.reasons.every((r) => r === "Outside their availability") ? "Enable in Uber" : "Do not enable"}
                </span>
              </li>
            ))}
            {ending.map(({ rider, slots }) => (
              <li key={`e-${rider.id}`} className="flex items-start justify-between gap-3 px-5 py-3">
                <div>
                  <Link href={`/admin/riders/${rider.id}`} className="text-sm font-semibold hover:text-brand-700">{fullName(rider)}</Link>
                  <p className="text-xs text-slate-500">Slot ends {formatMinute(endingSoon(slots, now, 30)[0].endMinute)}</p>
                </div>
                <span className="chip shrink-0 bg-amber-100 text-amber-900">Disable in Uber</span>
              </li>
            ))}
          </ul>
          {starting.length + ending.length === 0 && <Empty>Nothing starts in the next hour or ends in the next 30 minutes.</Empty>}
        </section>

        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">In a slot right now</h2></div>
          {inSlotNow.length === 0 ? (
            <Empty>Nobody has a slot at this moment.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {inSlotNow.map(({ rider, status, slots }) => (
                <li key={rider.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div>
                    <Link href={`/admin/riders/${rider.id}`} className="text-sm font-semibold hover:text-brand-700">{fullName(rider)}</Link>
                    <p className="text-xs text-slate-500">until {formatMinute(slotAt(slots, now.weekday, now.minute)!.endMinute)}</p>
                    {status.reasons.map((r) => <p key={r} className="text-xs font-medium text-rose-600">{r}</p>)}
                  </div>
                  <span className={`chip shrink-0 ${status.allowed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{status.allowed ? "May be online" : "Keep offline"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-6 overflow-x-auto">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Weekly coverage</h2>
          <p className="mt-0.5 text-sm text-slate-500">Cleared active riders available in each hour. Use it to see where you are thin.</p>
        </div>
        <table className="w-full min-w-[720px] border-separate border-spacing-1 p-4 text-center text-xs">
          <thead>
            <tr>
              <th />
              {Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => <th key={i} className="font-medium text-slate-500">{FIRST_HOUR + i}</th>)}
            </tr>
          </thead>
          <tbody>
            {coverage.map((row, d) => (
              <tr key={d}>
                <th className="pr-2 text-right font-medium text-slate-600">{WEEKDAYS[d].slice(0, 3)}</th>
                {row.map((count, i) => (
                  <td
                    key={i}
                    title={`${WEEKDAYS[d]} ${FIRST_HOUR + i}:00 — ${count} rider${count === 1 ? "" : "s"}`}
                    className="h-8 rounded font-semibold"
                    style={{ backgroundColor: count ? `rgba(11,138,126,${0.15 + 0.85 * (count / peak)})` : "#f1f5f9", color: count / peak > 0.5 ? "white" : "#334155" }}
                  >
                    {count || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {noAvailability.length > 0 && (
        <section className="card mt-6">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Active riders who have not set any hours</h2></div>
          <ul className="divide-y divide-slate-100">
            {noAvailability.map(({ rider }) => (
              <li key={rider.id}><Link href={`/admin/riders/${rider.id}`} className="block px-5 py-3 text-sm font-medium hover:bg-slate-50">{fullName(rider)}</Link></li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-relaxed text-slate-700">
        <p className="font-semibold text-slate-900">How this connects to Uber</p>
        <p className="mt-1">
          Uber&apos;s documented fleet API is read-only: it lets a fleet see whether a courier is online, offline or on a trip, but it has no call that blocks or
          allows someone to go online. So today this page tells your team who may be online; to enforce it automatically you need a write mechanism from Uber.
          Ask your Uber fleet manager what exists for your account.
        </p>
      </section>
    </>
  );
}
