import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { UploadCard } from "@/components/UploadCard";
import { ALL_NATIONALITIES, CITIES, EXPIRY_WARNING_DAYS, MIN_RIDER_AGE, type RiderStatus } from "@/lib/constants";
import { decryptField, maskValue } from "@/lib/crypto";
import { db } from "@/lib/db";
import { DOC_SECTIONS, DOC_SPECS, rejectionText, type DocType } from "@/lib/documents";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { pick } from "@/lib/notify";
import { currentDocs, daysUntil, docState, evaluate } from "@/lib/rider";
import { requireRider } from "@/lib/session";
import { toDateInput } from "@/lib/validators";
import {
  markNotificationsRead,
  requestDeletion,
  saveAgreements,
  saveBike,
  saveIdType,
  savePayroll,
  savePermitDeclaration,
  saveProfile,
  submitApplication,
} from "./actions";

export const metadata: Metadata = { title: "Your application" };

const EDITABLE = ["DRAFT", "SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED"];
const BANNER: Record<string, string> = {
  DRAFT: "border-slate-200 bg-white",
  SUBMITTED: "border-sky-200 bg-sky-50",
  IN_REVIEW: "border-indigo-200 bg-indigo-50",
  CHANGES_REQUESTED: "border-amber-300 bg-amber-50",
  APPROVED: "border-brand-200 bg-brand-50",
  UBER_ONBOARDING: "border-cyan-200 bg-cyan-50",
  ACTIVE: "border-emerald-200 bg-emerald-50",
  SUSPENDED: "border-orange-200 bg-orange-50",
  OFFBOARDED: "border-slate-200 bg-slate-100",
  REJECTED: "border-rose-200 bg-rose-50",
};

function Section({ n, title, done, open, children }: { n: number; title: string; done: boolean; open: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="card group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {done ? "✓" : n}
        </span>
        <span className="flex-1 text-base font-semibold">{title}</span>
        <svg className="h-4 w-4 text-slate-400 transition group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </summary>
      <div className="space-y-4 border-t border-slate-100 px-5 py-5">{children}</div>
    </details>
  );
}

function Radio({ name, value, defaultChecked, title, help }: { name: string; value: string; defaultChecked: boolean; title: string; help?: string }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3.5 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/60">
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} className="mt-1 accent-brand-600" />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        {help && <span className="block text-sm text-slate-600">{help}</span>}
      </span>
    </label>
  );
}

export default async function ApplyPage() {
  const user = await requireRider();
  const rider = user.rider;
  const locale = await getLocale();
  const d = t(locale);
  const [docs, notes] = await Promise.all([
    db.document.findMany({ where: { riderId: rider.id }, orderBy: { uploadedAt: "desc" } }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const ev = evaluate(rider, docs);
  const cur = currentDocs(docs);
  const status = rider.status as RiderStatus;
  const editable = EDITABLE.includes(status);
  const closed = status === "OFFBOARDED" || status === "REJECTED";
  const stepDone = (id: string) => ev.steps.find((s) => s.id === id)?.done ?? false;
  const doneCount = ev.steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / ev.steps.length) * 100);
  const fmt = (dt: Date) => dt.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" });
  const maxDob = toDateInput(new Date(Date.UTC(new Date().getUTCFullYear() - MIN_RIDER_AGE, new Date().getUTCMonth(), new Date().getUTCDate())));
  const unread = notes.filter((n) => !n.readAt).length;
  const isNonEu = rider.nationalityGroup === "NON_EU";

  const cardText = {
    states: d.apply.doc as unknown as Record<string, string>,
    upload: d.apply.doc.upload, replace: d.apply.doc.replace, view: d.apply.doc.view, uploading: d.apply.doc.uploading,
    hint: d.apply.doc.hint, validUntil: d.apply.doc.validUntil, locked: d.apply.doc.locked, tooBig: d.apply.doc.tooBig,
    optional: d.apply.doc.optional, renewalNote: d.apply.doc.renewalNote,
  };

  function docCard(type: DocType) {
    const doc = cur.get(type);
    const state = docState(doc);
    const spec = DOC_SPECS[type];
    const expiringSoon = !!doc?.expiresAt && daysUntil(doc.expiresAt) <= EXPIRY_WARNING_DAYS;
    const canReplace = !closed && (editable || state === "REJECTED" || state === "EXPIRED" || expiringSoon);
    return (
      <UploadCard
        key={type}
        type={type}
        label={spec[locale].label}
        help={spec[locale].help}
        state={state}
        docId={doc?.storageKey ? doc.id : undefined}
        fileName={doc?.originalName}
        rejectionText={doc?.status === "REJECTED" ? rejectionText(doc.rejectionCode, doc.rejectionNote, locale) : undefined}
        validUntil={doc?.expiresAt ? fmt(doc.expiresAt) : undefined}
        optional={spec.optional}
        canReplace={canReplace}
        renewalHint={expiringSoon}
        text={cardText}
      />
    );
  }
  const sectionDocs = (id: string) => DOC_SECTIONS.find((s) => s.id === id)!.docs(rider).map(docCard);

  let n = 0;
  const num = () => ++n;

  return (
    <>
      <main className="mx-auto max-w-3xl space-y-5 px-5 py-8">
        <div>
          <p className="text-sm text-slate-500">{d.apply.hello} {rider.firstName}</p>
          <h1 className="text-2xl font-bold tracking-tight">{d.apply.title}</h1>
        </div>

        <div className={`rounded-2xl border p-5 ${BANNER[status]}`}>
          <p className="text-lg font-semibold">{d.apply.status[status].t}</p>
          <p className="mt-1 text-slate-700">{d.apply.status[status].d}</p>
          {["DRAFT", "CHANGES_REQUESTED"].includes(status) && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-600">
                <span>{d.apply.progress}</span>
                <span>{doneCount} / {ev.steps.length} {d.apply.stepsDone}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>

        {notes.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{d.apply.notifications}</h2>
              {unread > 0 && (
                <form action={markNotificationsRead}>
                  <button className="text-sm font-medium text-brand-700 hover:underline">{d.apply.markRead}</button>
                </form>
              )}
            </div>
            <ul className="mt-3 space-y-3">
              {notes.map((nt) => (
                <li key={nt.id} className={`rounded-xl px-4 py-3 text-sm ${nt.readAt ? "bg-slate-50 text-slate-600" : nt.kind === "ACTION" ? "bg-amber-50 text-amber-950" : nt.kind === "SUCCESS" ? "bg-emerald-50 text-emerald-950" : "bg-sky-50 text-sky-950"}`}>
                  <p className="font-semibold">{pick(nt.title, locale)}</p>
                  <p className="mt-0.5">{pick(nt.body, locale)}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {["APPROVED", "UBER_ONBOARDING"].includes(status) && (
          <div className="card p-5">
            <h2 className="font-semibold">{d.apply.nextTitle}</h2>
            <ol className="mt-3 space-y-3">
              {d.apply.nextSteps.map((s, i) => (
                <li key={s} className="flex gap-3 text-sm text-slate-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* 1 — Profile */}
        <Section n={num()} title={d.apply.sections.profile} done={stepDone("profile")} open={!stepDone("profile")}>
          {editable ? (
            <ActionForm action={saveProfile} submit={d.apply.profile.save} pendingLabel="…" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="phone">{d.apply.profile.phone}</label>
                  <input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={rider.phone ?? ""} placeholder="+49 151 2345678" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="dateOfBirth">{d.apply.profile.dob}</label>
                  <input id="dateOfBirth" name="dateOfBirth" type="date" max={maxDob} defaultValue={toDateInput(rider.dateOfBirth)} className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="city">{d.apply.profile.city}</label>
                  <select id="city" name="city" defaultValue={rider.city} className="input">
                    {CITIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="nationality">{d.apply.profile.nationality}</label>
                  <select id="nationality" name="nationality" defaultValue={rider.nationality ?? ""} className="input" required>
                    <option value="" disabled>—</option>
                    {ALL_NATIONALITIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="university">{d.apply.profile.university}</label>
                <input id="university" name="university" defaultValue={rider.university ?? ""} placeholder="TU Berlin" className="input" required />
              </div>
              {isNonEu && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{d.apply.profile.nonEuNote}</p>}
            </ActionForm>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">{d.apply.profile.phone}</dt><dd className="font-medium">{rider.phone}</dd></div>
              <div><dt className="text-slate-500">{d.apply.profile.city}</dt><dd className="font-medium">{rider.city}</dd></div>
              <div><dt className="text-slate-500">{d.apply.profile.nationality}</dt><dd className="font-medium">{rider.nationality}</dd></div>
              <div><dt className="text-slate-500">{d.apply.profile.university}</dt><dd className="font-medium">{rider.university}</dd></div>
            </dl>
          )}
        </Section>

        {/* 2 — Identity */}
        <Section n={num()} title={d.apply.sections.identity} done={stepDone("identity")} open={!stepDone("identity")}>
          {editable && (
            <ActionForm action={saveIdType} submit={d.apply.idType.save} pendingLabel="…" className="rounded-xl bg-slate-50 p-4" buttonClass="btn btn-secondary btn-sm">
              <p className="label">{d.apply.idType.label}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Radio name="idType" value="ID_CARD" defaultChecked={rider.idType === "ID_CARD"} title={d.apply.idType.card} />
                <Radio name="idType" value="PASSPORT" defaultChecked={rider.idType === "PASSPORT"} title={d.apply.idType.passport} />
              </div>
            </ActionForm>
          )}
          {sectionDocs("identity")}
        </Section>

        {/* Residence permit (non-EU only) */}
        {isNonEu && (
          <Section n={num()} title={d.apply.sections.permit} done={stepDone("permit")} open={!stepDone("permit")}>
            {sectionDocs("permit")}
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold">{d.apply.permit.priorTitle}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{d.apply.permit.priorHelp}</p>
              {editable ? (
                <ActionForm action={savePermitDeclaration} submit={d.apply.permit.save} pendingLabel="…" className="mt-4 space-y-3">
                  <div className="max-w-xs">
                    <label className="label" htmlFor="priorDays">{d.apply.permit.priorLabel}</label>
                    <input id="priorDays" name="priorDays" type="number" min={0} max={140} step={0.5} defaultValue={rider.priorDaysDeclaredAt ? rider.priorDaysWorked : 0} className="input" required />
                  </div>
                  <label className="flex items-start gap-2.5 text-sm text-slate-700">
                    <input type="checkbox" name="confirm" defaultChecked={!!rider.priorDaysDeclaredAt} className="mt-0.5 accent-brand-600" />
                    <span>{d.apply.permit.priorConfirm}</span>
                  </label>
                </ActionForm>
              ) : (
                <p className="mt-3 text-sm font-medium">{d.apply.permit.priorLabel}: {rider.priorDaysWorked}</p>
              )}
            </div>
          </Section>
        )}

        {/* Student status */}
        <Section n={num()} title={d.apply.sections.student} done={stepDone("student")} open={!stepDone("student")}>
          {sectionDocs("student")}
        </Section>

        {/* Health insurance */}
        <Section n={num()} title={d.apply.sections.insurance} done={stepDone("insurance")} open={!stepDone("insurance")}>
          {sectionDocs("insurance")}
        </Section>

        {/* Payroll */}
        <Section n={num()} title={d.apply.sections.payroll} done={stepDone("payroll")} open={!stepDone("payroll")}>
          {!closed && (
            <ActionForm action={savePayroll} submit={d.apply.payroll.save} pendingLabel="…" className="space-y-4">
              <p className="text-sm text-slate-600">{d.apply.payroll.intro}</p>
              <div>
                <label className="label" htmlFor="taxId">{d.apply.payroll.taxId}</label>
                <input id="taxId" name="taxId" inputMode="numeric" autoComplete="off" placeholder={rider.taxIdEnc ? maskValue(decryptField(rider.taxIdEnc)) : "12 345 678 901"} className="input font-mono" />
                <p className="help">{d.apply.payroll.taxIdHelp}</p>
              </div>
              <div>
                <label className="label" htmlFor="svNumber">{d.apply.payroll.sv}</label>
                <input id="svNumber" name="svNumber" autoComplete="off" placeholder={rider.svNumberEnc ? maskValue(decryptField(rider.svNumberEnc)) : "15 070649 C 103"} className="input font-mono" />
                <p className="help">{d.apply.payroll.svHelp}</p>
                <label className="mt-2 flex items-start gap-2.5 text-sm text-slate-700">
                  <input type="checkbox" name="svPending" defaultChecked={rider.svPending} className="mt-0.5 accent-brand-600" />
                  <span>{d.apply.payroll.svPending}</span>
                </label>
              </div>
              <div>
                <label className="label" htmlFor="iban">{d.apply.payroll.iban}</label>
                <input id="iban" name="iban" autoComplete="off" placeholder={rider.ibanEnc ? maskValue(decryptField(rider.ibanEnc)) : "DE89 3704 0044 0532 0130 00"} className="input font-mono" />
                <p className="help">{d.apply.payroll.ibanHelp}</p>
              </div>
              <div>
                <label className="label" htmlFor="healthInsurer">{d.apply.payroll.insurer}</label>
                <input id="healthInsurer" name="healthInsurer" defaultValue={rider.healthInsurer ?? ""} className="input" required />
                <p className="help">{d.apply.payroll.insurerHelp}</p>
              </div>
              {(rider.taxIdEnc || rider.ibanEnc) && <p className="text-xs text-slate-500">🔒 {d.apply.payroll.stored} · {d.apply.payroll.savedHint}</p>}
            </ActionForm>
          )}
        </Section>

        {/* Bike */}
        <Section n={num()} title={d.apply.sections.bike} done={stepDone("bike") || rider.bikeMode === "FLEET_BIKE"} open={false}>
          {editable ? (
            <ActionForm action={saveBike} submit={d.apply.bike.save} pendingLabel="…" className="space-y-3" buttonClass="btn btn-secondary btn-sm">
              <p className="text-sm text-slate-600">{d.apply.bike.intro}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Radio name="bikeMode" value="OWN_BIKE" defaultChecked={rider.bikeMode === "OWN_BIKE"} title={d.apply.bike.own} help={d.apply.bike.ownHelp} />
                <Radio name="bikeMode" value="FLEET_BIKE" defaultChecked={rider.bikeMode === "FLEET_BIKE"} title={d.apply.bike.fleet} help={d.apply.bike.fleetHelp} />
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm font-medium">{rider.bikeMode === "OWN_BIKE" ? d.apply.bike.own : d.apply.bike.fleet}</p>
          )}
          {sectionDocs("bike")}
        </Section>

        {/* Agreements */}
        <Section n={num()} title={d.apply.sections.agreements} done={stepDone("agreements")} open={!stepDone("agreements")}>
          {editable ? (
            <ActionForm action={saveAgreements} submit={d.apply.agreements.save} pendingLabel="…" className="space-y-3">
              <label className="flex items-start gap-2.5 text-sm text-slate-700">
                <input type="checkbox" name="consent" defaultChecked={!!rider.consentDataAt} className="mt-0.5 accent-brand-600" />
                <span>{d.apply.agreements.consent} <Link href="/privacy" target="_blank" className="font-medium text-brand-700 hover:underline">{d.apply.agreements.consentLink}</Link></span>
              </label>
              <label className="flex items-start gap-2.5 text-sm text-slate-700">
                <input type="checkbox" name="contract" defaultChecked={!!rider.contractAckAt} className="mt-0.5 accent-brand-600" />
                <span>{d.apply.agreements.contract}</span>
              </label>
              <label className="flex items-start gap-2.5 text-sm text-slate-700">
                <input type="checkbox" name="conduct" defaultChecked={!!rider.conductAckAt} className="mt-0.5 accent-brand-600" />
                <span>{d.apply.agreements.conduct}</span>
              </label>
            </ActionForm>
          ) : (
            <p className="text-sm font-medium">{d.apply.agreements.accepted}{rider.consentDataAt ? ` · ${fmt(rider.consentDataAt)}` : ""}</p>
          )}
        </Section>

        {/* Submit */}
        {status === "DRAFT" && (
          <div className="card p-5">
            <h2 className="font-semibold">{d.apply.sections.submit}</h2>
            <p className="mt-1 text-sm text-slate-600">{d.apply.submit.intro}</p>
            {rider.dateOfBirth && !ev.canSubmit && ev.steps.every((s) => s.done) && (
              <p className="mt-2 text-sm text-rose-600">{d.apply.submit.underage}</p>
            )}
            <ActionForm action={submitApplication} submit={d.apply.submit.cta} pendingLabel="…" className="mt-4" disabled={!ev.canSubmit} buttonClass="btn btn-primary px-6">
              {!ev.canSubmit && <p className="text-sm text-slate-500">{d.apply.submit.blocked}</p>}
            </ActionForm>
          </div>
        )}

        <div className="card p-5">
          <h2 className="font-semibold">{d.apply.privacy.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a href="/api/me/export" className="text-sm font-medium text-brand-700 hover:underline">{d.apply.privacy.export}</a>
            {rider.deletionRequestedAt ? (
              <span className="text-sm text-slate-600">{d.apply.privacy.deleteDone}</span>
            ) : (
              <ActionForm action={requestDeletion} submit={d.apply.privacy.delete} pendingLabel="…" confirm={d.apply.privacy.deleteConfirm} buttonClass="text-sm font-medium text-rose-600 hover:underline">
                <span />
              </ActionForm>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
