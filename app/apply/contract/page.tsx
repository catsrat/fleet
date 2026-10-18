import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { EMPLOYMENT_TYPES } from "@/lib/constants";
import { contractStage } from "@/lib/contract-stage";
import { db } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { requireRider } from "@/lib/session";
import { uploadSignedContract } from "./actions";

export const metadata: Metadata = { title: "Employment contract" };

export default async function ContractPage() {
  const user = await requireRider();
  const locale = await getLocale();
  const d = t(locale).contract;
  const contract = await db.contract.findFirst({ where: { riderId: user.rider.id, supersededAt: null }, orderBy: { generatedAt: "desc" } });
  const fmt = (dt: Date) => dt.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "Europe/Berlin" });
  const stage = contract ? contractStage(contract) : null;

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

          {stage === "ISSUED" && (
            <section className="card p-5">
              <h2 className="font-semibold">{d.signTitle}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{d.signIntro}</p>
              <ActionForm action={uploadSignedContract} submit={d.signSubmit} pendingLabel="…" className="mt-4 space-y-2">
                <input
                  type="file"
                  name="file"
                  accept="application/pdf"
                  required
                  className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
                />
                <p className="text-xs text-slate-500">{d.signHint}</p>
              </ActionForm>
            </section>
          )}

          {stage === "RIDER_SIGNED" && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
              <p className="font-semibold text-sky-900">{d.awaitingTitle}</p>
              <p className="mt-1 text-sm text-sky-900/80">{d.awaitingBody}</p>
              {contract.riderSignedAt && (
                <p className="mt-3 text-sm text-sky-900/80">
                  {d.sentOn} {fmt(contract.riderSignedAt)} ·{" "}
                  <a href={`/api/contracts/${contract.id}?copy=signed`} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                    {d.yourSignedCopy}
                  </a>
                </p>
              )}
            </div>
          )}

          {stage === "COMPLETE" && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="font-semibold text-emerald-900">{d.completeTitle}</p>
              <p className="mt-1 text-sm text-emerald-900/80">{d.completeBody}</p>
              {contract.countersignedAt && <p className="mt-1 text-sm text-emerald-900/80">{d.countersignedOn} {fmt(contract.countersignedAt)}</p>}
              <a href={`/api/contracts/${contract.id}?copy=countersigned&download=1`} className="btn btn-primary btn-sm mt-4">
                {d.downloadFinal}
              </a>
            </div>
          )}
        </>
      )}
    </main>
  );
}
