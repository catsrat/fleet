import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, ProgressBar, Stat, StatusBadge } from "@/components/admin-ui";
import { loadComplianceRows } from "@/lib/compliance-data";
import { DOC_SPECS, type DocType } from "@/lib/documents";
import { fmtDate } from "@/lib/format";
import { daysUntil, fullName } from "@/lib/rider";

export const metadata: Metadata = { title: "Compliance" };

const WATCH_DAYS = 60;

export default async function CompliancePage() {
  const rows = await loadComplianceRows();
  const year = new Date().getUTCFullYear();

  const limited = rows.filter((r) => r.days.limit !== null).sort((a, b) => (b.days.pct ?? 0) - (a.days.pct ?? 0));
  const blocked = rows.filter((r) => r.elig.reasons.length > 0 && r.rider.status === "ACTIVE");

  const expiries = rows
    .flatMap(({ rider }) =>
      rider.documents
        .filter((d) => d.status === "APPROVED" && d.expiresAt)
        .map((d) => ({ rider, doc: d, left: daysUntil(d.expiresAt!) })),
    )
    // ignore an approved doc that a newer approved version already replaced
    .filter((e, _, all) => !all.some((o) => o.rider.id === e.rider.id && o.doc.type === e.doc.type && o.doc.uploadedAt > e.doc.uploadedAt))
    .filter((e) => e.left <= WATCH_DAYS)
    .sort((a, b) => a.left - b.left);

  return (
    <>
      <PageHeader title="Compliance" subtitle="Who may ride today, and who is about to stop being able to." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active riders not cleared" value={blocked.length} tone={blocked.length ? "warn" : "good"} hint="Expired documents or day limit reached" />
        <Stat label={`Documents expiring in ${WATCH_DAYS} days`} value={expiries.filter((e) => e.left > 0).length} tone={expiries.some((e) => e.left > 0) ? "warn" : "good"} />
        <Stat label="Expired documents" value={expiries.filter((e) => e.left <= 0).length} tone={expiries.some((e) => e.left <= 0) ? "warn" : "good"} />
      </div>

      <section className="card mt-6 overflow-x-auto">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Work-day limits {year}</h2>
          <p className="mt-0.5 text-sm text-slate-500">Non-EU students: 140 full or 280 half days per calendar year across all employers (§ 16b AufenthG).</p>
        </div>
        {limited.length === 0 ? (
          <Empty>No riders are subject to a day limit.</Empty>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-slate-100">
              <tr><th className="th">Rider</th><th className="th">Status</th><th className="th w-64">Days used</th><th className="th">Remaining</th><th className="th">Prior declared</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {limited.map(({ rider, days }) => (
                <tr key={rider.id} className="hover:bg-slate-50">
                  <td className="td"><Link href={`/admin/riders/${rider.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{fullName(rider)}</Link></td>
                  <td className="td"><StatusBadge status={rider.status} /></td>
                  <td className="td">
                    <div className="mb-1 text-xs tabular-nums text-slate-600">{days.used} / {days.limit}</div>
                    <ProgressBar pct={days.pct ?? 0} level={days.level} />
                  </td>
                  <td className={`td font-semibold tabular-nums ${days.level === "exceeded" ? "text-rose-600" : days.level === "warn" ? "text-amber-600" : ""}`}>
                    {days.remaining !== null && days.remaining > 0 ? days.remaining : "0 — limit reached"}
                  </td>
                  <td className="td">{days.priorStale ? <span className="font-medium text-amber-700">Not declared</span> : days.prior}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card mt-6 overflow-x-auto">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Document expiry</h2>
          <p className="mt-0.5 text-sm text-slate-500">Approved documents that expire within {WATCH_DAYS} days or already have. Riders are asked to upload a renewal from their dashboard.</p>
        </div>
        {expiries.length === 0 ? (
          <Empty>Nothing is expiring soon.</Empty>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-slate-100">
              <tr><th className="th">Rider</th><th className="th">Document</th><th className="th">Valid until</th><th className="th">Days left</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expiries.map(({ rider, doc, left }) => (
                <tr key={doc.id} className="hover:bg-slate-50">
                  <td className="td"><Link href={`/admin/riders/${rider.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{fullName(rider)}</Link></td>
                  <td className="td">{DOC_SPECS[doc.type as DocType].en.label}</td>
                  <td className="td tabular-nums">{fmtDate(doc.expiresAt)}</td>
                  <td className="td"><span className={`chip ${left <= 0 ? "bg-rose-100 text-rose-800" : left <= 30 ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{left <= 0 ? `Expired ${-left} d ago` : `${left} d`}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
