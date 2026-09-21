import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocBadge, StatusBadge } from "@/components/admin-ui";
import { DocViewer } from "@/components/DocViewer";
import { ReviewForm } from "@/components/ReviewForm";
import { WORK_AUTH } from "@/lib/constants";
import { db } from "@/lib/db";
import { DOC_SPECS, REJECTION_REASONS, type DocType } from "@/lib/documents";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { docState, fullName } from "@/lib/rider";
import { requireStaff } from "@/lib/session";
import { ageOn } from "@/lib/validators";

export const metadata: Metadata = { title: "Review document" };

/**
 * German semesters end on 31 March (winter) and 30 September (summer). Around a semester change a
 * certificate may be for either semester, so only prefill when it is unambiguous; otherwise the
 * reviewer must read the semester off the certificate.
 */
function suggestedSemesterEnd(uploaded: Date): string | undefined {
  const y = uploaded.getUTCFullYear();
  const mmdd = (uploaded.getUTCMonth() + 1) * 100 + uploaded.getUTCDate(); // 1 Oct = 1001
  if (mmdd >= 401 && mmdd <= 814) return `${y}-09-30`; // summer semester under way
  if (mmdd >= 1001) return `${y + 1}-03-31`; // winter semester under way
  if (mmdd <= 214) return `${y}-03-31`; // winter semester, after New Year
  return undefined; // 15 Aug–30 Sep and 15 Feb–31 Mar: could be either semester
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export default async function ReviewDocumentPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  await requireStaff();
  const { id, docId } = await params;
  const doc = await db.document.findUnique({ where: { id: docId }, include: { rider: { include: { user: { select: { email: true } } } } } });
  if (!doc || doc.riderId !== id) notFound();

  const rider = doc.rider;
  const spec = DOC_SPECS[doc.type as DocType];
  const [history, nextInQueue] = await Promise.all([
    db.document.findMany({ where: { riderId: rider.id, type: doc.type, id: { not: doc.id } }, orderBy: { uploadedAt: "desc" } }),
    db.document.findFirst({ where: { status: "PENDING_REVIEW", id: { not: doc.id } }, orderBy: { uploadedAt: "asc" }, select: { id: true, riderId: true } }),
  ]);
  const pending = doc.status === "PENDING_REVIEW";
  const isPermit = doc.type.startsWith("PERMIT_");

  return (
    <>
      <nav className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Breadcrumb">
        <div className="flex items-center gap-2 text-slate-500">
          <Link href="/admin/riders" className="hover:text-slate-900">Riders</Link>/
          <Link href={`/admin/riders/${rider.id}`} className="hover:text-slate-900">{fullName(rider)}</Link>/
          <span className="font-medium text-slate-900">{spec.en.label}</span>
        </div>
        {nextInQueue && (
          <Link href={`/admin/riders/${nextInQueue.riderId}/docs/${nextInQueue.id}`} className="font-medium text-brand-700 hover:underline">
            Skip to next in queue →
          </Link>
        )}
      </nav>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-bold">{spec.en.label}</h1>
            <DocBadge state={docState(doc)} />
          </div>
          {doc.storageKey ? (
            <DocViewer src={`/api/files/${doc.id}`} mime={doc.mimeType} title={`${spec.en.label} — ${fullName(rider)}`} />
          ) : (
            <p className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">This file was removed when the rider replaced it.</p>
          )}
          <dl className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
            <Row label="Uploaded" value={fmtDateTime(doc.uploadedAt)} />
            <Row label="File" value={`${doc.originalName} · ${(doc.sizeBytes / 1024).toFixed(0)} KB`} />
            <Row label="SHA-256" value={<span className="font-mono text-xs">{doc.sha256.slice(0, 16)}…</span>} />
          </dl>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-semibold">Compare with applicant</h2>
              <StatusBadge status={rider.status} />
            </div>
            <dl className="divide-y divide-slate-100">
              <Row label="Name" value={fullName(rider)} />
              <Row label="Date of birth" value={rider.dateOfBirth ? `${fmtDate(rider.dateOfBirth)} (${ageOn(rider.dateOfBirth)})` : "—"} />
              <Row label="Nationality" value={`${rider.nationality ?? "—"} · ${rider.nationalityGroup === "NON_EU" ? "Non-EU" : "EU/EEA/CH"}`} />
              <Row label="University" value={rider.university ?? "—"} />
              <Row label="ID type" value={rider.idType === "PASSPORT" ? "Passport" : "ID card"} />
              {isPermit && <Row label="Work authorization" value={rider.workAuthorization ? WORK_AUTH[rider.workAuthorization as keyof typeof WORK_AUTH] : "Not recorded yet"} />}
            </dl>
          </section>

          <section className="card p-5">
            {pending ? (
              <>
                <h2 className="mb-4 font-semibold">Decision</h2>
                <ReviewForm
                  docId={doc.id}
                  checks={spec.checks}
                  expiry={spec.expiry}
                  expiryLabel={spec.expiryLabel}
                  defaultExpiry={doc.type === "ENROLLMENT_CERT" ? suggestedSemesterEnd(doc.uploadedAt) : undefined}
                  askWorkAuth={doc.type === "PERMIT_BACK" || doc.type === "PERMIT_ADDENDUM"}
                  workAuthOptions={Object.entries(WORK_AUTH).map(([value, label]) => ({ value, label }))}
                  currentWorkAuth={rider.workAuthorization ?? undefined}
                  reasons={Object.entries(REJECTION_REASONS).map(([code, r]) => ({ code, label: r.en }))}
                />
              </>
            ) : (
              <>
                <h2 className="mb-3 font-semibold">Review result</h2>
                <dl className="divide-y divide-slate-100">
                  <Row label="Decision" value={<DocBadge state={docState(doc)} />} />
                  <Row label="Reviewed by" value={doc.reviewedByName ?? "—"} />
                  <Row label="Reviewed" value={fmtDateTime(doc.reviewedAt)} />
                  {doc.expiresAt && <Row label={spec.expiryLabel ?? "Expires"} value={fmtDate(doc.expiresAt)} />}
                  {doc.rejectionCode && <Row label="Reason" value={`${REJECTION_REASONS[doc.rejectionCode]?.en ?? doc.rejectionCode}${doc.rejectionNote ? ` — ${doc.rejectionNote}` : ""}`} />}
                </dl>
              </>
            )}
          </section>

          {history.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Earlier uploads of this document</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-slate-600">{fmtDateTime(h.uploadedAt)}</span>
                    <span className="flex items-center gap-2">
                      <DocBadge state={docState(h)} />
                      {h.status === "SUPERSEDED" && <span className="text-xs text-slate-400">superseded</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
