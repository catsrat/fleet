import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { BikeStatus, Empty, PageHeader } from "@/components/admin-ui";
import { BIKE_KINDS } from "@/lib/constants";
import { db } from "@/lib/db";
import { euro, fmtDate, fmtDay, humanize } from "@/lib/format";
import { fullName } from "@/lib/rider";
import { toDateInput } from "@/lib/validators";
import { addMaintenance, assignBike, returnBike, setBikeStatus, updateBike } from "../actions";

export const metadata: Metadata = { title: "E-bike" };

export default async function BikeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bike = await db.bike.findUnique({
    where: { id },
    include: {
      assignments: { orderBy: { assignedAt: "desc" }, include: { rider: { select: { id: true, firstName: true, lastName: true } } } },
      maintenance: { orderBy: { date: "desc" } },
    },
  });
  if (!bike) notFound();

  const open = bike.assignments.find((a) => !a.returnedAt);
  const candidates =
    bike.status === "AVAILABLE"
      ? await db.rider.findMany({
          where: { status: { in: ["APPROVED", "UBER_ONBOARDING", "ACTIVE"] }, assignments: { none: { returnedAt: null } } },
          orderBy: { lastName: "asc" },
          select: { id: true, firstName: true, lastName: true, bikeMode: true },
        })
      : [];
  const totalCost = bike.maintenance.reduce((s, m) => s + (m.costCents ?? 0), 0);

  return (
    <>
      <Link href="/admin/bikes" className="text-sm text-slate-500 hover:text-slate-900">← Fleet</Link>
      <PageHeader title={`${bike.code} · ${bike.make} ${bike.model}`} subtitle={`Frame ${bike.frameNumber} · ${bike.motorWatts} W · assist to ${bike.maxAssistKmh} km/h`} actions={<BikeStatus status={bike.status} />} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 font-semibold">Current rider</h2>
            {open ? (
              <>
                <p className="text-sm">
                  <Link href={`/admin/riders/${open.rider.id}`} className="font-semibold text-brand-700 hover:underline">{fullName(open.rider)}</Link> · since {fmtDay(open.assignedAt)}
                </p>
                {open.conditionOut && <p className="mt-1 text-sm text-slate-600">Handed over: {open.conditionOut}</p>}
                {open.depositCents != null && <p className="text-sm text-slate-600">Deposit: {euro(open.depositCents)}</p>}
                <ActionForm action={returnBike} submit="Record return" pendingLabel="Saving…" buttonClass="btn btn-secondary btn-sm" className="mt-4 space-y-3">
                  <input type="hidden" name="assignmentId" value={open.id} />
                  <div><label className="label" htmlFor="ci">Condition on return</label><input id="ci" name="conditionIn" className="input" /></div>
                  <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="needsService" className="accent-brand-600" />Needs service before the next rider</label>
                </ActionForm>
              </>
            ) : bike.status === "AVAILABLE" ? (
              candidates.length ? (
                <ActionForm action={assignBike} submit="Hand over" pendingLabel="Saving…" className="space-y-3">
                  <input type="hidden" name="bikeId" value={bike.id} />
                  <div>
                    <label className="label" htmlFor="riderId">Rider</label>
                    <select id="riderId" name="riderId" className="input" required>
                      {candidates.map((c) => <option key={c.id} value={c.id}>{fullName(c)}{c.bikeMode === "OWN_BIKE" ? " (planned own bike)" : ""}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><label className="label" htmlFor="co">Condition</label><input id="co" name="conditionOut" className="input" /></div>
                    <div><label className="label" htmlFor="dep">Deposit (€)</label><input id="dep" name="deposit" inputMode="decimal" className="input" /></div>
                  </div>
                </ActionForm>
              ) : (
                <p className="text-sm text-slate-600">No approved riders are waiting for a bike.</p>
              )
            ) : (
              <p className="text-sm text-slate-600">This bike is {bike.status.toLowerCase()} and cannot be assigned.</p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-4 font-semibold">Details</h2>
            <ActionForm action={updateBike} submit="Save" pendingLabel="Saving…" buttonClass="btn btn-secondary btn-sm" className="space-y-3">
              <input type="hidden" name="bikeId" value={bike.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label" htmlFor="ins">Insurance until</label><input id="ins" name="insuranceUntil" type="date" defaultValue={toDateInput(bike.insuranceUntil)} className="input" /></div>
                <div><label className="label" htmlFor="svc">Next service due</label><input id="svc" name="nextServiceDue" type="date" defaultValue={toDateInput(bike.nextServiceDue)} className="input" /></div>
              </div>
              <div><label className="label" htmlFor="bat">Battery serial</label><input id="bat" name="batterySerial" defaultValue={bike.batterySerial ?? ""} className="input font-mono" /></div>
              <div><label className="label" htmlFor="notes">Notes</label><input id="notes" name="notes" defaultValue={bike.notes ?? ""} className="input" /></div>
            </ActionForm>
            {bike.status !== "ASSIGNED" && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {(["AVAILABLE", "MAINTENANCE", "RETIRED"] as const).filter((s) => s !== bike.status).map((s) => (
                  <ActionForm key={s} action={setBikeStatus} submit={`Mark ${s.toLowerCase()}`} pendingLabel="…" buttonClass="btn btn-ghost btn-sm">
                    <input type="hidden" name="bikeId" value={bike.id} />
                    <input type="hidden" name="status" value={s} />
                  </ActionForm>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 font-semibold">Log maintenance</h2>
            <ActionForm action={addMaintenance} submit="Add entry" pendingLabel="Saving…" buttonClass="btn btn-primary btn-sm" resetOnSuccess className="space-y-3">
              <input type="hidden" name="bikeId" value={bike.id} />
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className="label" htmlFor="kind">Type</label><select id="kind" name="kind" className="input">{BIKE_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</select></div>
                <div><label className="label" htmlFor="mdate">Date</label><input id="mdate" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input" required /></div>
                <div><label className="label" htmlFor="cost">Cost (€)</label><input id="cost" name="cost" inputMode="decimal" className="input" /></div>
              </div>
              <div><label className="label" htmlFor="mnote">Note</label><input id="mnote" name="note" className="input" maxLength={400} /></div>
              <div><label className="label" htmlFor="nsd">Next service due <span className="text-slate-400">(optional)</span></label><input id="nsd" name="nextServiceDue" type="date" className="input" /></div>
            </ActionForm>
          </section>

          <section className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold">Maintenance history</h2>
              <span className="text-sm text-slate-500">Total {euro(totalCost)}</span>
            </div>
            {bike.maintenance.length === 0 ? (
              <Empty>No entries yet.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {bike.maintenance.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium">{humanize(m.kind)}</p>
                      <p className="text-xs text-slate-500">{fmtDate(m.date)}{m.createdByName ? ` · ${m.createdByName}` : ""}{m.note ? ` · ${m.note}` : ""}</p>
                    </div>
                    <span className="shrink-0 tabular-nums text-slate-700">{euro(m.costCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Assignment history</h2></div>
            {bike.assignments.length === 0 ? (
              <Empty>Never assigned.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {bike.assignments.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <Link href={`/admin/riders/${a.rider.id}`} className="font-medium hover:text-brand-700">{fullName(a.rider)}</Link>
                    <p className="text-xs text-slate-500">{fmtDay(a.assignedAt)} → {a.returnedAt ? fmtDay(a.returnedAt) : "now"}{a.conditionIn ? ` · returned: ${a.conditionIn}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
