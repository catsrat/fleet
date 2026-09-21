import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { BikeStatus, Empty, PageHeader, Stat } from "@/components/admin-ui";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { daysUntil, fullName } from "@/lib/rider";
import { createBike } from "./actions";

export const metadata: Metadata = { title: "Fleet" };

function Due({ date }: { date: Date | null }) {
  if (!date) return <span className="text-slate-400">—</span>;
  const left = daysUntil(date);
  const tone = left <= 0 ? "font-semibold text-rose-600" : left <= 14 ? "font-medium text-amber-700" : "";
  return <span className={tone}>{fmtDate(date)}{left <= 0 ? " (overdue)" : ""}</span>;
}

export default async function BikesPage() {
  const bikes = await db.bike.findMany({
    orderBy: { code: "asc" },
    include: { assignments: { where: { returnedAt: null }, include: { rider: { select: { id: true, firstName: true, lastName: true } } } } },
  });
  const count = (s: string) => bikes.filter((b) => b.status === s).length;
  const overdue = bikes.filter((b) => b.status !== "RETIRED" && b.nextServiceDue && daysUntil(b.nextServiceDue) <= 0).length;

  return (
    <>
      <PageHeader title="Fleet" subtitle="Pedelecs (max. 25 km/h, 250 W) — assignment, service and insurance." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Available" value={count("AVAILABLE")} tone="good" />
        <Stat label="Assigned" value={count("ASSIGNED")} />
        <Stat label="In maintenance" value={count("MAINTENANCE")} tone={count("MAINTENANCE") ? "warn" : "default"} />
        <Stat label="Service overdue" value={overdue} tone={overdue ? "warn" : "good"} />
      </div>

      <section className="card mt-6 overflow-x-auto">
        {bikes.length === 0 ? (
          <Empty>No e-bikes yet. Add your first one below.</Empty>
        ) : (
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-slate-100">
              <tr><th className="th">Bike</th><th className="th">Status</th><th className="th">Rider</th><th className="th">Next service</th><th className="th">Insurance until</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bikes.map((b) => {
                const a = b.assignments[0];
                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link href={`/admin/bikes/${b.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{b.code}</Link>
                      <p className="text-xs text-slate-500">{b.make} {b.model} · {b.frameNumber}</p>
                    </td>
                    <td className="td"><BikeStatus status={b.status} /></td>
                    <td className="td">{a ? <Link href={`/admin/riders/${a.rider.id}`} className="hover:text-brand-700">{fullName(a.rider)}</Link> : <span className="text-slate-400">—</span>}</td>
                    <td className="td"><Due date={b.nextServiceDue} /></td>
                    <td className="td"><Due date={b.insuranceUntil} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <details className="card mt-6 overflow-hidden" open={bikes.length === 0}>
        <summary className="cursor-pointer px-5 py-4 font-semibold">Add an e-bike</summary>
        <div className="border-t border-slate-100 p-5">
          <ActionForm action={createBike} submit="Add e-bike" pendingLabel="Adding…" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className="label" htmlFor="make">Make</label><input id="make" name="make" className="input" required placeholder="Cube" /></div>
              <div><label className="label" htmlFor="model">Model</label><input id="model" name="model" className="input" required placeholder="Kathmandu Hybrid" /></div>
              <div><label className="label" htmlFor="code">Fleet code <span className="text-slate-400">(auto)</span></label><input id="code" name="code" className="input" placeholder="NF-001" /></div>
              <div><label className="label" htmlFor="frameNumber">Frame number</label><input id="frameNumber" name="frameNumber" className="input font-mono" required /></div>
              <div><label className="label" htmlFor="batterySerial">Battery serial</label><input id="batterySerial" name="batterySerial" className="input font-mono" /></div>
              <div><label className="label" htmlFor="purchaseDate">Purchased</label><input id="purchaseDate" name="purchaseDate" type="date" className="input" /></div>
              <div><label className="label" htmlFor="motorWatts">Motor (W)</label><input id="motorWatts" name="motorWatts" type="number" defaultValue={250} max={250} className="input" /></div>
              <div><label className="label" htmlFor="maxAssistKmh">Assist up to (km/h)</label><input id="maxAssistKmh" name="maxAssistKmh" type="number" defaultValue={25} max={25} className="input" /></div>
              <div><label className="label" htmlFor="insuranceUntil">Insurance until</label><input id="insuranceUntil" name="insuranceUntil" type="date" className="input" /></div>
              <div><label className="label" htmlFor="nextServiceDue">Next service due</label><input id="nextServiceDue" name="nextServiceDue" type="date" className="input" /></div>
            </div>
            <div><label className="label" htmlFor="notes">Notes</label><input id="notes" name="notes" className="input" /></div>
          </ActionForm>
        </div>
      </details>
    </>
  );
}
