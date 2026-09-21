import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Stat, StatusBadge } from "@/components/admin-ui";
import { PayslipUpload } from "@/components/PayslipUpload";
import { db } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { KIND_LABEL, PAYSLIP_KINDS, isPayslipKind, periodLabel, type PayslipKind } from "@/lib/payslips";
import { fullName } from "@/lib/rider";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Payroll" };

type Params = { kind?: string; year?: string; month?: string };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = new Date();
  const kind: PayslipKind = sp.kind && isPayslipKind(sp.kind) ? sp.kind : "PAYSLIP";
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year = Number(sp.year) || (kind === "ANNUAL" ? now.getUTCFullYear() - 1 : previous.getUTCFullYear());
  const month = kind === "ANNUAL" ? 0 : Number(sp.month) || previous.getUTCMonth() + 1;

  const riders = await db.rider.findMany({
    where: { activatedAt: { not: null } },
    orderBy: { lastName: "asc" },
    include: { payslips: { where: { kind, year, month, supersededAt: null } } },
  });

  const uploaded = riders.filter((r) => r.payslips.length > 0);
  const opened = uploaded.filter((r) => r.payslips[0].firstDownloadedAt);
  const years = Array.from({ length: 5 }, (_, i) => now.getUTCFullYear() - i);
  const period = periodLabel(kind, year, month, "en");

  return (
    <>
      <PageHeader title="Payroll documents" subtitle="Upload payslips, earnings statements and annual certificates. Riders see them under Payslips in their own account." />

      <form className="card mb-6 flex flex-wrap items-end gap-3 p-4" role="search">
        <div>
          <label className="label" htmlFor="kind">Document</label>
          <select id="kind" name="kind" defaultValue={kind} className="input">
            {PAYSLIP_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k].en}</option>)}
          </select>
        </div>
        {kind !== "ANNUAL" && (
          <div>
            <label className="label" htmlFor="month">Month</label>
            <select id="month" name="month" defaultValue={month} className="input">
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(Date.UTC(2000, i, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="year">Year</label>
          <select id="year" name="year" defaultValue={year} className="input">{years.map((y) => <option key={y}>{y}</option>)}</select>
        </div>
        <button className="btn btn-primary">Show</button>
      </form>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label={`${KIND_LABEL[kind].en} · ${period}`} value={`${uploaded.length} / ${riders.length}`} hint="Riders with a document" tone={uploaded.length === riders.length && riders.length > 0 ? "good" : "default"} />
        <Stat label="Still missing" value={riders.length - uploaded.length} tone={riders.length - uploaded.length > 0 ? "warn" : "good"} />
        <Stat label="Opened by the rider" value={`${opened.length} / ${uploaded.length}`} hint="First open is recorded" />
      </div>

      <section className="card overflow-x-auto">
        {riders.length === 0 ? (
          <Empty>No rider has started work yet, so there is nobody to issue documents to.</Empty>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-slate-100">
              <tr><th className="th">Rider</th><th className="th">Status</th><th className="th">Document</th><th className="th text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {riders.map((r) => {
                const doc = r.payslips[0];
                return (
                  <tr key={r.id} className="align-top hover:bg-slate-50">
                    <td className="td"><Link href={`/admin/riders/${r.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{fullName(r)}</Link></td>
                    <td className="td"><StatusBadge status={r.status} /></td>
                    <td className="td">
                      {doc ? (
                        <>
                          <a href={`/api/payslips/${doc.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">{doc.originalName}</a>
                          <p className="text-xs text-slate-500">
                            Added {fmtDay(doc.uploadedAt)} by {doc.uploadedByName ?? "—"} ·{" "}
                            {doc.firstDownloadedAt ? <span className="text-emerald-700">opened {fmtDay(doc.firstDownloadedAt)} ({doc.downloadCount}×)</span> : <span className="text-amber-700">not opened yet</span>}
                          </p>
                        </>
                      ) : (
                        <span className="chip bg-amber-100 text-amber-900">Missing</span>
                      )}
                    </td>
                    <td className="td"><PayslipUpload riderId={r.id} kind={kind} year={year} month={month} existingId={doc?.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
