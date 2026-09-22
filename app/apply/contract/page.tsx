import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { EMPLOYMENT_TYPES } from "@/lib/constants";
import { db } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { requireRider } from "@/lib/session";
import { acknowledgeContract } from "./actions";

export const metadata: Metadata = { title: "Employment contract" };

export default async function ContractPage() {
  const user = await requireRider();
  const locale = await getLocale();
  const d = t(locale).contract;
  const contract = await db.contract.findFirst({ where: { riderId: user.rider.id, supersededAt: null }, orderBy: { generatedAt: "desc" } });
  const fmt = (dt: Date) => dt.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "Europe/Berlin" });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{d.title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{d.intro}</p>
      </div>

      {!contract ? (
        <div className="card px-5 py-12 text-center text-sm text-slate-500">{d.none}</div>
      ) : (
        <>
          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{d.docTitle}</p>
                <p className="text-sm text-slate-500">
                  {EMPLOYMENT_TYPES[contract.employmentType as keyof typeof EMPLOYMENT_TYPES] ?? contract.employmentType} · {d.issued} {fmt(contract.generatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <a href={`/api/contracts/${contract.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-600 hover:text-slate-900">{d.open}</a>
                <a href={`/api/contracts/${contract.id}?download=1`} className="btn btn-primary btn-sm">{d.download}</a>
              </div>
            </div>
          </section>

          {contract.acknowledgedAt ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="font-semibold text-emerald-900">{d.accepted}</p>
              <p className="mt-1 text-sm text-emerald-900/80">{d.acceptedOn} {fmt(contract.acknowledgedAt)}</p>
            </div>
          ) : (
            <section className="card p-5">
              <h2 className="font-semibold">{d.confirmTitle}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{d.confirmIntro}</p>
              <ActionForm action={acknowledgeContract} submit={d.confirmSubmit} pendingLabel="…" className="mt-4">
                <label className="flex items-start gap-2.5 text-sm text-slate-700">
                  <input type="checkbox" name="confirm" className="mt-0.5 accent-brand-600" />
                  <span>{d.confirmCheckbox}</span>
                </label>
              </ActionForm>
            </section>
          )}
        </>
      )}
    </main>
  );
}
