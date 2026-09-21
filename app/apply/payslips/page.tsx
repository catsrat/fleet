import type { Metadata } from "next";
import { db } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { KIND_LABEL, isPayslipKind, periodLabel } from "@/lib/payslips";
import { requireRider } from "@/lib/session";

export const metadata: Metadata = { title: "Payslips" };

export default async function PayslipsPage() {
  const user = await requireRider();
  const locale = await getLocale();
  const d = t(locale).payslips;
  const docs = await db.payslip.findMany({
    where: { riderId: user.rider.id, supersededAt: null },
    orderBy: [{ year: "desc" }, { month: "desc" }, { uploadedAt: "desc" }],
  });
  const fmt = (dt: Date) => dt.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "Europe/Berlin" });

  const byYear = new Map<number, typeof docs>();
  for (const doc of docs) byYear.set(doc.year, [...(byYear.get(doc.year) ?? []), doc]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{d.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{d.intro}</p>
      </div>

      {docs.length === 0 ? (
        <div className="card px-5 py-12 text-center text-sm text-slate-500">{d.empty}</div>
      ) : (
        [...byYear.entries()].map(([year, items]) => (
          <section key={year}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{year}</h2>
            <ul className="card divide-y divide-slate-100">
              {items.map((p) => {
                const kind = isPayslipKind(p.kind) ? p.kind : "PAYSLIP";
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {periodLabel(kind, p.year, p.month, locale)}
                        {!p.firstDownloadedAt && <span className="chip ml-2 bg-brand-100 text-brand-800">{d.newBadge}</span>}
                      </p>
                      <p className="text-sm text-slate-500">
                        {KIND_LABEL[kind][locale]} · {d.added} {fmt(p.uploadedAt)}
                        {p.firstDownloadedAt && ` · ${d.opened} ${fmt(p.firstDownloadedAt)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <a href={`/api/payslips/${p.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-600 hover:text-slate-900">{d.open}</a>
                      <a href={`/api/payslips/${p.id}?download=1`} className="btn btn-primary btn-sm">{d.download}</a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {docs.length > 0 && <p className="text-xs text-slate-500">{d.keep}</p>}
    </main>
  );
}
