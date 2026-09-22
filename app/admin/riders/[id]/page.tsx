import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { DocBadge, ProgressBar, StatusBadge } from "@/components/admin-ui";
import { RevealPayroll } from "@/components/RevealPayroll";
import { WEEKDAYS, formatMinute } from "@/lib/availability";
import { dayStatus, eligibility, isoWeekKey, yearBounds } from "@/lib/compliance";
import { EMPLOYMENT_TYPES, WERKSTUDENT_WEEKLY_HOURS, WORK_AUTH } from "@/lib/constants";
import { decryptField, maskValue } from "@/lib/crypto";
import { db } from "@/lib/db";
import { DOC_SECTIONS, DOC_SPECS } from "@/lib/documents";
import { fmtDate, fmtDay, fmtDateTime, humanize } from "@/lib/format";
import { KIND_LABEL, isPayslipKind, periodLabel } from "@/lib/payslips";
import { approvalBlockers, daysUntil, docState, evaluate, fullName, currentDocs } from "@/lib/rider";
import { isAdminRole } from "@/lib/roles";
import { requireStaff } from "@/lib/session";
import { ageOn, toDateInput } from "@/lib/validators";
import {
  approveRider,
  deleteWorkLog,
  eraseRider,
  logWork,
  markDeletionHandled,
  messageRider,
  resetRiderPassword,
  saveInternalNote,
  setRiderStatus,
  setWorkAuthorization,
} from "../../actions";
import { assignBike, returnBike } from "../../bikes/actions";
import { issueContract } from "../../contracts/actions";

export const metadata: Metadata = { title: "Rider" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Transition({ riderId, to, label, tone = "secondary", reason = false }: { riderId: string; to: string; label: string; tone?: "primary" | "secondary" | "danger"; reason?: boolean }) {
  return (
    <ActionForm action={setRiderStatus} submit={label} pendingLabel="Saving…" buttonClass={`btn btn-sm ${tone === "primary" ? "btn-primary" : tone === "danger" ? "btn-danger" : "btn-secondary"} w-full`} className="space-y-2">
      <input type="hidden" name="riderId" value={riderId} />
      <input type="hidden" name="to" value={to} />
      {reason && <input name="reason" placeholder="Reason (required, internal)" className="input" required minLength={5} />}
    </ActionForm>
  );
}

export default async function RiderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireStaff();
  const { id } = await params;
  const isAdmin = isAdminRole(viewer.role);

  const rider = await db.rider.findUnique({
    where: { id },
    include: {
      user: true,
      documents: { orderBy: { uploadedAt: "desc" } },
      assignments: { include: { bike: true }, orderBy: { assignedAt: "desc" } },
    },
  });
  if (!rider) notFound();

  const year = new Date().getUTCFullYear();
  const { start, end } = yearBounds(year);
  const [yearLogs, timeline, freeBikes, slots, payslips, contract] = await Promise.all([
    db.workLog.findMany({ where: { riderId: id, date: { gte: start, lt: end } }, orderBy: { date: "desc" } }),
    db.auditLog.findMany({ where: { riderId: id, action: { not: "DOCUMENT_VIEWED" } }, orderBy: { at: "desc" }, take: 25 }),
    db.bike.findMany({ where: { status: "AVAILABLE" }, orderBy: { code: "asc" } }),
    db.availabilitySlot.findMany({ where: { riderId: id }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    // reviewers never see payslips, so they are not even loaded for them
    isAdmin ? db.payslip.findMany({ where: { riderId: id, supersededAt: null }, orderBy: [{ year: "desc" }, { month: "desc" }], take: 24 }) : Promise.resolve([]),
    isAdmin ? db.contract.findFirst({ where: { riderId: id, supersededAt: null }, orderBy: { generatedAt: "desc" } }) : Promise.resolve(null),
  ]);

  const ev = evaluate(rider, rider.documents);
  const cur = currentDocs(rider.documents);
  const blockers = approvalBlockers(rider, rider.documents);
  const days = dayStatus(rider, yearLogs.map((l) => l.hours), year);
  const elig = eligibility(rider, rider.documents, days);
  const inReview = ["SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED"].includes(rider.status);
  const openAssignment = rider.assignments.find((a) => !a.returnedAt);
  const canAssign = ["APPROVED", "UBER_ONBOARDING", "ACTIVE"].includes(rider.status) && !openAssignment;
  const reached = ["APPROVED", "UBER_ONBOARDING", "ACTIVE", "SUSPENDED", "OFFBOARDED"].includes(rider.status);

  const weekly = new Map<string, number>();
  for (const l of yearLogs) weekly.set(isoWeekKey(l.date), (weekly.get(isoWeekKey(l.date)) ?? 0) + l.hours);
  const overloadedWeeks = [...weekly.entries()].filter(([, h]) => h > WERKSTUDENT_WEEKLY_HOURS).map(([w]) => w);

  return (
    <>
      <div className="mb-6">
        <Link href="/admin/riders" className="text-sm text-slate-500 hover:text-slate-900">← Riders</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{fullName(rider)}</h1>
          <StatusBadge status={rider.status} />
          {rider.nationalityGroup === "NON_EU" && <span className="chip bg-amber-100 text-amber-800">Non-EU</span>}
        </div>
        <p className="mt-1 text-sm text-slate-600">{rider.user.email} · {rider.phone ?? "no phone"} · {rider.city}</p>
      </div>

      {rider.deletionRequestedAt && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4">
          <p className="text-sm font-medium text-rose-900">This rider asked for their data to be deleted on {fmtDay(rider.deletionRequestedAt)}.</p>
          <form action={markDeletionHandled}>
            <input type="hidden" name="riderId" value={rider.id} />
            <button className="btn btn-secondary btn-sm">Dismiss request</button>
          </form>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card title="Documents" action={<span className="text-sm text-slate-500">{ev.required.filter((t) => ev.states[t] === "APPROVED").length}/{ev.required.length} approved</span>}>
            <ul className="-my-2 divide-y divide-slate-100">
              {DOC_SECTIONS.flatMap((s) => s.docs(rider)).map((type) => {
                const doc = cur.get(type);
                const spec = DOC_SPECS[type];
                const state = docState(doc);
                const left = doc?.expiresAt ? daysUntil(doc.expiresAt) : null;
                return (
                  <li key={type} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{spec.en.label}{spec.optional && <span className="ml-2 text-xs text-slate-400">optional</span>}</p>
                      <p className="text-xs text-slate-500">
                        {doc ? `Uploaded ${fmtDateTime(doc.uploadedAt)}` : "Nothing uploaded"}
                        {doc?.expiresAt && <span className={left !== null && left <= 30 ? " font-medium text-amber-700" : ""}> · valid until {fmtDate(doc.expiresAt)}{left !== null && left > 0 && left <= 30 ? ` (${left} d)` : ""}</span>}
                      </p>
                      {doc?.status === "REJECTED" && doc.rejectionCode && <p className="text-xs text-amber-800">Rejected: {doc.rejectionCode.toLowerCase().replace(/_/g, " ")}{doc.rejectionNote ? ` — ${doc.rejectionNote}` : ""}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <DocBadge state={state} />
                      {doc && doc.storageKey && (
                        <Link href={`/admin/riders/${rider.id}/docs/${doc.id}`} className={`btn btn-sm ${doc.status === "PENDING_REVIEW" ? "btn-primary" : "btn-secondary"}`}>
                          {doc.status === "PENDING_REVIEW" ? "Review" : "Open"}
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Applicant details">
            <dl className="divide-y divide-slate-100">
              <Row label="Date of birth" value={rider.dateOfBirth ? `${fmtDate(rider.dateOfBirth)} (${ageOn(rider.dateOfBirth)})` : "—"} />
              <Row label="Nationality" value={rider.nationality ?? "—"} />
              <Row label="University" value={rider.university ?? "—"} />
              <Row label="ID type" value={rider.idType === "PASSPORT" ? "Passport" : "ID card"} />
              <Row label="E-bike" value={rider.bikeMode === "OWN_BIKE" ? "Own bike" : "Fleet bike"} />
              <Row label="Employment type" value={rider.employmentType ? EMPLOYMENT_TYPES[rider.employmentType as keyof typeof EMPLOYMENT_TYPES] : "Not set"} />
              <Row label="Data consent" value={fmtDateTime(rider.consentDataAt)} />
              <Row label="Rider terms" value={fmtDateTime(rider.contractAckAt)} />
              <Row label="Code of conduct" value={fmtDateTime(rider.conductAckAt)} />
              <Row label="Registered" value={fmtDay(rider.createdAt)} />
            </dl>
          </Card>

          <Card title="Payroll data" action={isAdmin ? <RevealPayroll riderId={rider.id} /> : <span className="text-xs text-slate-400">Full values: admins only</span>}>
            <dl className="divide-y divide-slate-100">
              <Row label="Tax ID" value={<span className="font-mono">{maskValue(decryptField(rider.taxIdEnc))}</span>} />
              <Row label="Social security no." value={rider.svPending ? <span className="text-amber-700">Requested by employer</span> : <span className="font-mono">{maskValue(decryptField(rider.svNumberEnc))}</span>} />
              <Row label="IBAN" value={<span className="font-mono">{maskValue(decryptField(rider.ibanEnc))}</span>} />
              <Row label="Health insurer" value={rider.healthInsurer ?? "—"} />
            </dl>
          </Card>

          {rider.nationalityGroup === "NON_EU" && (
            <Card title="Work permission (non-EU)">
              <dl className="divide-y divide-slate-100">
                <Row label="Residence permit says" value={rider.workAuthorization ? WORK_AUTH[rider.workAuthorization as keyof typeof WORK_AUTH] : <span className="text-amber-700">Not recorded</span>} />
                <Row label={`Declared prior days (${year})`} value={rider.priorDaysDeclaredAt ? `${rider.priorDaysWorked} · declared ${fmtDate(rider.priorDaysDeclaredAt)}` : <span className="text-amber-700">Not declared</span>} />
              </dl>
              <ActionForm action={setWorkAuthorization} submit="Update" pendingLabel="Saving…" buttonClass="btn btn-secondary btn-sm" className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="riderId" value={rider.id} />
                <div className="min-w-56 flex-1">
                  <label className="label" htmlFor="wa">Correct the work authorization</label>
                  <select id="wa" name="workAuthorization" defaultValue={rider.workAuthorization ?? "RESTRICTED_140"} className="input">
                    {Object.entries(WORK_AUTH).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </ActionForm>
            </Card>
          )}

          {reached && (
            <Card title={`Work days ${year}`}>
              {days.limit !== null ? (
                <div className="mb-5">
                  <div className="mb-2 flex items-baseline justify-between text-sm">
                    <span className="font-semibold">{days.used} of {days.limit} full days used</span>
                    <span className={days.level === "exceeded" ? "font-semibold text-rose-600" : days.level === "warn" ? "font-semibold text-amber-600" : "text-slate-500"}>
                      {days.remaining !== null && days.remaining > 0 ? `${days.remaining} left` : "Limit reached"}
                    </span>
                  </div>
                  <ProgressBar pct={days.pct ?? 0} level={days.level} />
                  <p className="mt-2 text-xs text-slate-500">{days.worked} worked with us + {days.prior} declared elsewhere. Over 4 h = 1 day, up to 4 h = ½ day.</p>
                  {days.priorStale && <p className="mt-1 text-xs font-medium text-amber-700">Prior work days have not been declared for {year}.</p>}
                </div>
              ) : (
                <p className="mb-5 text-sm text-slate-600">No annual day limit applies. {yearLogs.length} day(s) logged this year.</p>
              )}
              {rider.employmentType === "WERKSTUDENT" && overloadedWeeks.length > 0 && (
                <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Over {WERKSTUDENT_WEEKLY_HOURS} h in {overloadedWeeks.join(", ")} — this can void the Werkstudent social-insurance privilege during term time.
                </p>
              )}
              <ActionForm action={logWork} submit="Log day" pendingLabel="Saving…" buttonClass="btn btn-primary btn-sm" resetOnSuccess className="grid items-end gap-3 sm:grid-cols-[1fr_100px_1.5fr_auto]">
                <input type="hidden" name="riderId" value={rider.id} />
                <div><label className="label" htmlFor="date">Date</label><input id="date" name="date" type="date" className="input" required max={new Date().toISOString().slice(0, 10)} /></div>
                <div><label className="label" htmlFor="hours">Hours</label><input id="hours" name="hours" type="number" step="0.25" min="0.25" max="16" className="input" required /></div>
                <div><label className="label" htmlFor="wnote">Note</label><input id="wnote" name="note" className="input" maxLength={200} placeholder="optional" /></div>
              </ActionForm>
              {yearLogs.length > 0 && (
                <table className="mt-5 w-full text-sm">
                  <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2">Date</th><th className="py-2">Hours</th><th className="py-2">Counts as</th><th /></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {yearLogs.slice(0, 15).map((l) => (
                      <tr key={l.id}>
                        <td className="py-2">{fmtDate(l.date)}</td>
                        <td className="py-2 tabular-nums">{l.hours}</td>
                        <td className="py-2">{l.hours > 4 ? "1 day" : "½ day"}</td>
                        <td className="py-2 text-right">
                          <form action={deleteWorkLog}><input type="hidden" name="id" value={l.id} /><button className="text-xs font-medium text-rose-600 hover:underline">Remove</button></form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}

          {(reached || openAssignment) && (
            <Card title="E-bike">
              {openAssignment ? (
                <>
                  <p className="text-sm">
                    <Link href={`/admin/bikes/${openAssignment.bikeId}`} className="font-semibold text-brand-700 hover:underline">{openAssignment.bike.code}</Link>{" "}
                    · {openAssignment.bike.make} {openAssignment.bike.model} · since {fmtDay(openAssignment.assignedAt)}
                  </p>
                  <ActionForm action={returnBike} submit="Record return" pendingLabel="Saving…" buttonClass="btn btn-secondary btn-sm" className="mt-4 space-y-3">
                    <input type="hidden" name="assignmentId" value={openAssignment.id} />
                    <div><label className="label" htmlFor="ci">Condition on return</label><input id="ci" name="conditionIn" className="input" placeholder="e.g. Good, minor scratches" /></div>
                    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="needsService" className="accent-brand-600" />Needs service before the next rider</label>
                  </ActionForm>
                </>
              ) : canAssign ? (
                freeBikes.length ? (
                  <ActionForm action={assignBike} submit="Hand over e-bike" pendingLabel="Saving…" className="space-y-3">
                    <input type="hidden" name="riderId" value={rider.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className="label" htmlFor="bikeId">Available bike</label>
                        <select id="bikeId" name="bikeId" className="input" required>{freeBikes.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.make} {b.model}</option>)}</select></div>
                      <div><label className="label" htmlFor="deposit">Deposit (€, optional)</label><input id="deposit" name="deposit" inputMode="decimal" className="input" /></div>
                    </div>
                    <div><label className="label" htmlFor="co">Condition on handover</label><input id="co" name="conditionOut" className="input" placeholder="e.g. New lock, battery 100%" /></div>
                  </ActionForm>
                ) : (
                  <p className="text-sm text-slate-600">No bikes available right now. <Link href="/admin/bikes" className="font-medium text-brand-700 hover:underline">Open fleet</Link></p>
                )
              ) : (
                <p className="text-sm text-slate-600">No bike assigned.</p>
              )}
              {rider.assignments.filter((a) => a.returnedAt).length > 0 && (
                <p className="mt-4 text-xs text-slate-500">Previous: {rider.assignments.filter((a) => a.returnedAt).map((a) => a.bike.code).join(", ")}</p>
              )}
            </Card>
          )}

          {reached && (
            <Card title="Availability" action={<Link href="/admin/schedule" className="text-sm font-medium text-brand-700 hover:underline">Schedule</Link>}>
              {slots.length === 0 ? (
                <p className="text-sm text-slate-500">The rider has not set any hours yet.</p>
              ) : (
                <dl className="divide-y divide-slate-100">
                  {WEEKDAYS.map((name, i) => {
                    const day = slots.filter((s) => s.weekday === i + 1);
                    return day.length ? <Row key={name} label={name} value={day.map((s) => `${formatMinute(s.startMinute)}–${formatMinute(s.endMinute)}`).join(", ")} /> : null;
                  })}
                </dl>
              )}
            </Card>
          )}

          {isAdmin && (reached || payslips.length > 0) && (
            <Card title="Payslips & statements" action={<Link href="/admin/payroll" className="text-sm font-medium text-brand-700 hover:underline">Payroll</Link>}>
              {payslips.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing uploaded yet.</p>
              ) : (
                <ul className="-my-2 divide-y divide-slate-100">
                  {payslips.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <a href={`/api/payslips/${p.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                        {KIND_LABEL[isPayslipKind(p.kind) ? p.kind : "PAYSLIP"].en} · {periodLabel(p.kind, p.year, p.month, "en")}
                      </a>
                      <span className={`text-xs ${p.firstDownloadedAt ? "text-emerald-700" : "text-amber-700"}`}>{p.firstDownloadedAt ? `opened ${fmtDay(p.firstDownloadedAt)}` : "not opened"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {isAdmin && reached && (
            <Card title="Employment contract">
              {contract ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-sm">
                    <a href={`/api/contracts/${contract.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                      Version {contract.version} · {EMPLOYMENT_TYPES[contract.employmentType as keyof typeof EMPLOYMENT_TYPES] ?? contract.employmentType}
                    </a>
                    <p className="text-xs text-slate-500">Issued {fmtDay(contract.generatedAt)}{contract.generatedByName ? ` by ${contract.generatedByName}` : ""}</p>
                  </div>
                  <span className={`chip ${contract.acknowledgedAt ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                    {contract.acknowledgedAt ? `Accepted ${fmtDay(contract.acknowledgedAt)}` : "Awaiting acceptance"}
                  </span>
                </div>
              ) : (
                <p className="mb-4 text-sm text-slate-500">No contract issued yet.</p>
              )}
              <ActionForm action={issueContract} submit={contract ? "Issue a new version" : "Issue contract"} pendingLabel="Generating…" buttonClass="btn btn-secondary btn-sm" className="space-y-3">
                <input type="hidden" name="riderId" value={rider.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label" htmlFor="cet">Employment type</label>
                    <select id="cet" name="employmentType" defaultValue={rider.employmentType ?? "WERKSTUDENT"} className="input">
                      {Object.entries(EMPLOYMENT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="cstart">Start date</label>
                    <input id="cstart" name="startDate" type="date" defaultValue={toDateInput(rider.activatedAt ?? rider.approvedAt ?? new Date())} className="input" required />
                  </div>
                  <div>
                    <label className="label" htmlFor="chourly">Hourly rate (€)</label>
                    <input id="chourly" name="hourly" inputMode="decimal" placeholder="optional" className="input" />
                  </div>
                </div>
                <p className="help">Generates a PDF from the rider&apos;s own details and publishes it to their portal. The wording lives in <code>lib/contract.ts</code> and must be reviewed by a lawyer before real use.</p>
              </ActionForm>
            </Card>
          )}

          <Card title="Activity">
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : (
              <ol className="space-y-3">
                {timeline.map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                    <div>
                      <p className="font-medium text-slate-900">{humanize(e.action)}</p>
                      <p className="text-xs text-slate-500">{e.actorName ?? "System"} · {fmtDateTime(e.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">
          {reached && (elig.reasons.length > 0 || elig.warnings.length > 0) && (
            <div className={`rounded-2xl border p-5 ${elig.reasons.length ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
              <p className={`font-semibold ${elig.reasons.length ? "text-rose-900" : "text-amber-900"}`}>{elig.reasons.length ? "Not cleared to ride" : "Heads-up"}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {elig.reasons.map((r) => <li key={r} className="font-medium text-rose-800">• {r}</li>)}
                {elig.warnings.map((w) => <li key={w} className="text-amber-900">• {w}</li>)}
              </ul>
            </div>
          )}

          <Card title="Pipeline">
            <div className="space-y-3">
              {inReview && (
                <>
                  {blockers.length > 0 ? (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Before approval</p>
                      <ul className="space-y-1 text-sm text-slate-700">{blockers.map((b) => <li key={b}>• {b}</li>)}</ul>
                    </div>
                  ) : (
                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">Everything verified — ready to approve.</p>
                  )}
                  <ActionForm action={approveRider} submit="Approve rider" pendingLabel="Approving…" buttonClass="btn btn-primary w-full" disabled={blockers.length > 0} className="space-y-3">
                    <input type="hidden" name="riderId" value={rider.id} />
                    <div>
                      <label className="label" htmlFor="et">Employment type</label>
                      <select id="et" name="employmentType" defaultValue={rider.employmentType ?? "WERKSTUDENT"} className="input">
                        {Object.entries(EMPLOYMENT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  </ActionForm>
                  <Transition riderId={rider.id} to="REJECTED" label="Reject application" tone="danger" reason />
                </>
              )}
              {rider.status === "APPROVED" && <Transition riderId={rider.id} to="UBER_ONBOARDING" label="Uber onboarding started" tone="primary" />}
              {rider.status === "UBER_ONBOARDING" && <Transition riderId={rider.id} to="ACTIVE" label="Confirm activated in Uber" tone="primary" />}
              {rider.status === "ACTIVE" && <Transition riderId={rider.id} to="SUSPENDED" label="Suspend" reason />}
              {rider.status === "SUSPENDED" && <Transition riderId={rider.id} to="ACTIVE" label="Reinstate" tone="primary" />}
              {["APPROVED", "UBER_ONBOARDING", "ACTIVE", "SUSPENDED"].includes(rider.status) && <Transition riderId={rider.id} to="OFFBOARDED" label="Offboard" tone="danger" reason />}
              {rider.status === "REJECTED" && <Transition riderId={rider.id} to="DRAFT" label="Reopen application" />}
              {rider.status === "DRAFT" && <p className="text-sm text-slate-500">The rider has not submitted yet.</p>}
              {rider.status === "OFFBOARDED" && <p className="text-sm text-slate-500">This rider has been offboarded.</p>}
              <dl className="divide-y divide-slate-100 border-t border-slate-100 pt-1">
                <Row label="Submitted" value={fmtDay(rider.submittedAt)} />
                <Row label="Approved" value={rider.approvedAt ? `${fmtDay(rider.approvedAt)} · ${rider.approvedByName}` : "—"} />
                <Row label="Activated" value={fmtDay(rider.activatedAt)} />
              </dl>
            </div>
          </Card>

          <Card title="Message the rider">
            <ActionForm action={messageRider} submit="Send" pendingLabel="Sending…" buttonClass="btn btn-secondary btn-sm" resetOnSuccess className="space-y-3">
              <input type="hidden" name="riderId" value={rider.id} />
              <textarea name="message" rows={3} maxLength={500} required className="input" placeholder="Shown to the rider on their dashboard exactly as written." aria-label="Message" />
            </ActionForm>
          </Card>

          <Card title="Internal note">
            <ActionForm action={saveInternalNote} submit="Save note" pendingLabel="Saving…" buttonClass="btn btn-secondary btn-sm" className="space-y-3">
              <input type="hidden" name="riderId" value={rider.id} />
              <textarea name="note" rows={4} maxLength={2000} defaultValue={rider.internalNote ?? ""} className="input" placeholder="Only visible to staff" aria-label="Internal note" />
            </ActionForm>
          </Card>

          {isAdmin && !rider.user.googleSub && (
            <Card title="Sign-in help">
              <p className="mb-3 text-sm text-slate-600">If the rider forgot their password, issue a temporary one. They must change it at their next sign-in.</p>
              <ActionForm action={resetRiderPassword} submit="Reset password" pendingLabel="Resetting…" buttonClass="btn btn-secondary btn-sm" confirm="Generate a new temporary password for this rider?">
                <input type="hidden" name="riderId" value={rider.id} />
              </ActionForm>
            </Card>
          )}

          {isAdmin && !rider.activatedAt && (
            <Card title="Danger zone">
              <p className="mb-3 text-sm text-slate-600">Permanently deletes this applicant, their documents and files. Not possible once a rider has worked for us.</p>
              <ActionForm action={eraseRider} submit="Erase applicant data" pendingLabel="Erasing…" buttonClass="btn btn-danger btn-sm" confirm="This permanently deletes the applicant and all their files. Continue?" className="space-y-3">
                <input type="hidden" name="riderId" value={rider.id} />
                <input name="confirmEmail" className="input" placeholder={`Type ${rider.user.email} to confirm`} required aria-label="Confirm email" />
              </ActionForm>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
