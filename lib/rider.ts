import type { Document, Rider } from "@prisma/client";
import { db } from "./db";
import { DOC_SECTIONS, DOC_SPECS, applicableDocTypes, requiredDocTypes, type DocType } from "./documents";
import { isAdult } from "./validators";

export type DocState = "MISSING" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED";

const DAY_MS = 86_400_000;

/** Expiry dates are stored as UTC midnight of the last valid day, so a document is valid through that whole day. */
export function isPast(expiresAt: Date | null | undefined, now = new Date()): boolean {
  return !!expiresAt && now.getTime() >= expiresAt.getTime() + DAY_MS;
}

export function daysUntil(expiresAt: Date, now = new Date()): number {
  return Math.ceil((expiresAt.getTime() + DAY_MS - now.getTime()) / DAY_MS);
}

export function currentDocs(docs: Document[]): Map<DocType, Document> {
  const map = new Map<DocType, Document>();
  for (const d of docs) {
    if (d.status === "SUPERSEDED") continue;
    const prev = map.get(d.type as DocType);
    if (!prev || prev.uploadedAt < d.uploadedAt) map.set(d.type as DocType, d);
  }
  return map;
}

export function docState(doc: Document | undefined, now = new Date()): DocState {
  if (!doc) return "MISSING";
  if (doc.status === "APPROVED" && isPast(doc.expiresAt, now)) return "EXPIRED";
  return doc.status as DocState;
}

export const profileComplete = (r: Rider) =>
  !!(r.firstName && r.lastName && r.phone && r.dateOfBirth && r.city && r.nationality && r.university);

export const payrollComplete = (r: Rider) =>
  !!(r.taxIdEnc && r.ibanEnc && r.healthInsurer && (r.svNumberEnc || r.svPending));

export const agreementsComplete = (r: Rider) => !!(r.consentDataAt && r.contractAckAt && r.conductAckAt);

export const permitDeclarationComplete = (r: Rider) => r.nationalityGroup !== "NON_EU" || !!r.priorDaysDeclaredAt;

export interface Step {
  id: "profile" | "identity" | "permit" | "student" | "insurance" | "payroll" | "bike" | "agreements";
  done: boolean;
}

export interface Evaluation {
  required: DocType[];
  states: Partial<Record<DocType, DocState>>;
  missing: DocType[];
  rejected: DocType[];
  pending: DocType[];
  expired: DocType[];
  profileOk: boolean;
  permitDeclOk: boolean;
  payrollOk: boolean;
  agreementsOk: boolean;
  steps: Step[];
  canSubmit: boolean;
}

export function evaluate(rider: Rider, docs: Document[], now = new Date()): Evaluation {
  const cur = currentDocs(docs);
  const applicable = applicableDocTypes(rider);
  const required = requiredDocTypes(rider);
  const states: Partial<Record<DocType, DocState>> = {};
  for (const t of applicable) states[t] = docState(cur.get(t), now);

  const stateOf = (t: DocType) => states[t] as DocState;
  const missing = required.filter((t) => stateOf(t) === "MISSING");
  const rejected = applicable.filter((t) => stateOf(t) === "REJECTED");
  const pending = applicable.filter((t) => stateOf(t) === "PENDING_REVIEW");
  const expired = applicable.filter((t) => stateOf(t) === "EXPIRED");

  const profileOk = profileComplete(rider);
  const permitDeclOk = permitDeclarationComplete(rider);
  const payrollOk = payrollComplete(rider);
  const agreementsOk = agreementsComplete(rider);

  const sectionDone = (id: string) => {
    const section = DOC_SECTIONS.find((s) => s.id === id)!;
    return section
      .docs(rider)
      .filter((t) => !DOC_SPECS[t].optional)
      .every((t) => ["PENDING_REVIEW", "APPROVED"].includes(stateOf(t)));
  };

  const steps: Step[] = [{ id: "profile", done: profileOk }, { id: "identity", done: sectionDone("identity") }];
  if (rider.nationalityGroup === "NON_EU") steps.push({ id: "permit", done: sectionDone("permit") && permitDeclOk });
  steps.push({ id: "student", done: sectionDone("student") });
  steps.push({ id: "insurance", done: sectionDone("insurance") });
  steps.push({ id: "payroll", done: payrollOk });
  if (rider.bikeMode === "OWN_BIKE") steps.push({ id: "bike", done: sectionDone("bike") });
  steps.push({ id: "agreements", done: agreementsOk });

  const adult = !!rider.dateOfBirth && isAdult(rider.dateOfBirth);
  const canSubmit =
    steps.every((s) => s.done) && missing.length === 0 && rejected.length === 0 && expired.length === 0 && adult;

  return { required, states, missing, rejected, pending, expired, profileOk, permitDeclOk, payrollOk, agreementsOk, steps, canSubmit };
}

/** Everything that must be true before staff can sign an applicant off. Empty array = ready to approve. */
export function approvalBlockers(rider: Rider, docs: Document[], now = new Date()): string[] {
  const ev = evaluate(rider, docs, now);
  const out: string[] = [];
  for (const t of ev.required) {
    const s = ev.states[t];
    if (s !== "APPROVED") out.push(`${DOC_SPECS[t].en.label}: ${s === "PENDING_REVIEW" ? "awaiting review" : (s ?? "missing").toLowerCase()}`);
  }
  if (!ev.profileOk) out.push("Profile incomplete");
  if (!rider.dateOfBirth || !isAdult(rider.dateOfBirth)) out.push("Applicant must be at least 18");
  if (!ev.payrollOk) out.push("Payroll details incomplete");
  if (!ev.agreementsOk) out.push("Agreements not accepted");
  if (rider.nationalityGroup === "NON_EU") {
    if (!ev.permitDeclOk) out.push("Prior work days not declared");
    if (!rider.workAuthorization) out.push("Work authorization not recorded (set it when reviewing the residence permit)");
    if (rider.workAuthorization === "NOT_PERMITTED") out.push("Residence permit does not allow employment");
  }
  return out;
}

const REVIEWABLE = ["SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED"];

/** Keeps the pipeline status in sync after any upload or review decision. */
export async function refreshPipelineStatus(riderId: string): Promise<void> {
  const rider = await db.rider.findUnique({ where: { id: riderId }, include: { documents: true } });
  if (!rider || !REVIEWABLE.includes(rider.status)) return;
  const ev = evaluate(rider, rider.documents);
  let next: string;
  if (ev.rejected.length || ev.missing.length || ev.expired.length) next = "CHANGES_REQUESTED";
  else if (ev.pending.length === 0) next = "IN_REVIEW";
  else next = [...currentDocs(rider.documents).values()].some((d) => d.status === "APPROVED") ? "IN_REVIEW" : "SUBMITTED";
  if (next !== rider.status) await db.rider.update({ where: { id: riderId }, data: { status: next } });
}

export function fullName(r: Pick<Rider, "firstName" | "lastName">): string {
  return `${r.firstName} ${r.lastName}`.trim();
}
