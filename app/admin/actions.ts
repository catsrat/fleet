"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { EMPLOYMENT_TYPES, WORK_AUTH, type EmploymentType, type WorkAuth } from "@/lib/constants";
import { decryptField } from "@/lib/crypto";
import { db } from "@/lib/db";
import { DOC_SPECS, REJECTION_REASONS, rejectionText, type DocType } from "@/lib/documents";
import { notify } from "@/lib/notify";
import { hashPassword, temporaryPassword } from "@/lib/passwords";
import { approvalBlockers, isPast, refreshPipelineStatus } from "@/lib/rider";
import { requireAdmin, requireStaff } from "@/lib/session";
import { deleteFile } from "@/lib/storage";
import { parseDateInput } from "@/lib/validators";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

async function staff() {
  const user = await requireStaff();
  return { user, actor: { id: user.id, name: user.name } };
}

export async function reviewDocument(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const doc = await db.document.findUnique({ where: { id: text(fd, "docId") }, include: { rider: true } });
  if (!doc) return { error: "Document not found." };
  if (doc.status !== "PENDING_REVIEW") return { error: "This document has already been reviewed." };
  const spec = DOC_SPECS[doc.type as DocType];
  const decision = text(fd, "decision");

  if (decision === "approve") {
    const ticked = fd.getAll("check").map(String);
    if (spec.checks.some((c) => !ticked.includes(c.id))) return { error: "Tick every check before approving." };

    const expiresAt = parseDateInput(fd.get("expiresAt"));
    if (spec.expiry === "required" && !expiresAt) return { error: `Enter the "${spec.expiryLabel}" date from the document.` };
    if (expiresAt && isPast(expiresAt)) return { error: "The document is already expired — reject it instead." };

    const chosenAuth = text(fd, "workAuthorization");
    if (chosenAuth && !(chosenAuth in WORK_AUTH)) return { error: "Invalid work authorization." };
    const carriesWorkRule = doc.type === "PERMIT_BACK" || doc.type === "PERMIT_ADDENDUM";
    if (doc.type === "PERMIT_BACK" && !chosenAuth && !doc.rider.workAuthorization) {
      return { error: "Record the work authorization shown on the permit." };
    }

    await db.$transaction([
      db.document.update({
        where: { id: doc.id },
        data: {
          status: "APPROVED",
          expiresAt,
          reviewedAt: new Date(),
          reviewedByName: actor.name,
          rejectionCode: null,
          rejectionNote: null,
          checksJson: JSON.stringify(ticked),
        },
      }),
      db.document.updateMany({
        where: { riderId: doc.riderId, type: doc.type, status: "APPROVED", id: { not: doc.id } },
        data: { status: "SUPERSEDED" },
      }),
      ...(carriesWorkRule && chosenAuth
        ? [db.rider.update({ where: { id: doc.riderId }, data: { workAuthorization: chosenAuth as WorkAuth } })]
        : []),
    ]);
    await audit({ actor, action: "DOCUMENT_APPROVED", entityType: "Document", entityId: doc.id, riderId: doc.riderId, meta: { type: doc.type, expiresAt, workAuthorization: chosenAuth || undefined } });
  } else if (decision === "reject") {
    const code = text(fd, "reasonCode");
    const note = text(fd, "note").slice(0, 400);
    if (!(code in REJECTION_REASONS)) return { error: "Choose a rejection reason." };
    if (code === "OTHER" && note.length < 3) return { error: "Add a note explaining what is wrong." };

    await db.document.update({
      where: { id: doc.id },
      data: { status: "REJECTED", reviewedAt: new Date(), reviewedByName: actor.name, rejectionCode: code, rejectionNote: note || null },
    });
    const rider = await db.rider.findUniqueOrThrow({ where: { id: doc.riderId } });
    const label = DOC_SPECS[doc.type as DocType];
    await notify(rider.userId, {
      kind: "ACTION",
      title: { en: `Please upload again: ${label.en.label}`, de: `Bitte erneut hochladen: ${label.de.label}` },
      body: { en: rejectionText(code, note, "en"), de: rejectionText(code, note, "de") },
    });
    await audit({ actor, action: "DOCUMENT_REJECTED", entityType: "Document", entityId: doc.id, riderId: doc.riderId, meta: { type: doc.type, code, note } });
  } else {
    return { error: "Choose approve or reject." };
  }

  await refreshPipelineStatus(doc.riderId);
  revalidatePath("/admin", "layout");
  const next = await db.document.findFirst({
    where: { riderId: doc.riderId, status: "PENDING_REVIEW" },
    orderBy: { uploadedAt: "asc" },
    select: { id: true },
  });
  redirect(next ? `/admin/riders/${doc.riderId}/docs/${next.id}` : `/admin/riders/${doc.riderId}`);
}

export async function approveRider(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const rider = await db.rider.findUnique({ where: { id: text(fd, "riderId") }, include: { documents: true } });
  if (!rider) return { error: "Rider not found." };
  if (!["SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED"].includes(rider.status)) return { error: "This applicant is not awaiting approval." };
  const employmentType = text(fd, "employmentType") as EmploymentType;
  if (!(employmentType in EMPLOYMENT_TYPES)) return { error: "Choose the employment type." };

  const blockers = approvalBlockers(rider, rider.documents);
  if (blockers.length) return { error: `Cannot approve yet: ${blockers.join("; ")}.` };

  await db.rider.update({ where: { id: rider.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedByName: actor.name, employmentType } });
  await notify(rider.userId, {
    kind: "SUCCESS",
    title: { en: "You're approved!", de: "Du bist freigegeben!" },
    body: {
      en: "All your documents are verified. We'll send you the instructions to activate your Uber Eats courier account.",
      de: "Alle deine Dokumente sind geprüft. Wir schicken dir die Anleitung zur Aktivierung deines Uber-Eats-Kurierkontos.",
    },
  });
  await audit({ actor, action: "RIDER_APPROVED", entityType: "Rider", entityId: rider.id, riderId: rider.id, meta: { employmentType } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Approved." };
}

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["REJECTED"],
  SUBMITTED: ["REJECTED"],
  IN_REVIEW: ["REJECTED"],
  CHANGES_REQUESTED: ["REJECTED"],
  REJECTED: ["DRAFT"],
  APPROVED: ["UBER_ONBOARDING", "OFFBOARDED"],
  UBER_ONBOARDING: ["ACTIVE", "OFFBOARDED"],
  ACTIVE: ["SUSPENDED", "OFFBOARDED"],
  SUSPENDED: ["ACTIVE", "OFFBOARDED"],
  OFFBOARDED: [],
};
const NEEDS_REASON = ["REJECTED", "SUSPENDED", "OFFBOARDED"];

const RIDER_NOTICE: Record<string, { kind: "INFO" | "SUCCESS" | "ACTION"; title: { en: string; de: string }; body: { en: string; de: string } } | undefined> = {
  UBER_ONBOARDING: {
    kind: "ACTION",
    title: { en: "Next: activate with Uber", de: "Nächster Schritt: Uber-Aktivierung" },
    body: {
      en: "We've started your Uber Eats onboarding. Follow the instructions we sent you; Uber will verify your ID and run its own background check.",
      de: "Wir haben dein Uber-Eats-Onboarding gestartet. Folge der Anleitung, die wir dir geschickt haben; Uber prüft deinen Ausweis und führt eine eigene Hintergrundprüfung durch.",
    },
  },
  ACTIVE: {
    kind: "SUCCESS",
    title: { en: "You're active!", de: "Du bist aktiv!" },
    body: { en: "You can now accept deliveries. Ride safe!", de: "Du kannst jetzt Lieferungen annehmen. Fahr sicher!" },
  },
  SUSPENDED: {
    kind: "ACTION",
    title: { en: "Your account is suspended", de: "Dein Konto ist gesperrt" },
    body: { en: "Please contact our support team.", de: "Bitte kontaktiere unser Support-Team." },
  },
  REJECTED: {
    kind: "INFO",
    title: { en: "Application declined", de: "Bewerbung abgelehnt" },
    body: { en: "Unfortunately we can't offer you a place. Contact support for details.", de: "Leider können wir dir keinen Platz anbieten. Kontaktiere den Support für Details." },
  },
};

export async function setRiderStatus(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const rider = await db.rider.findUnique({ where: { id: text(fd, "riderId") } });
  if (!rider) return { error: "Rider not found." };
  const to = text(fd, "to");
  if (!(TRANSITIONS[rider.status] ?? []).includes(to)) return { error: `Cannot move from ${rider.status} to ${to}.` };
  const reason = text(fd, "reason").slice(0, 500);
  if (NEEDS_REASON.includes(to) && reason.length < 5) return { error: "Please give a reason (min. 5 characters)." };

  if (to === "OFFBOARDED") {
    const open = await db.bikeAssignment.count({ where: { riderId: rider.id, returnedAt: null } });
    if (open) return { error: "Return the assigned e-bike before offboarding." };
  }

  await db.rider.update({
    where: { id: rider.id },
    data: { status: to, ...(to === "ACTIVE" && !rider.activatedAt ? { activatedAt: new Date() } : {}) },
  });
  const notice = RIDER_NOTICE[to];
  if (notice) await notify(rider.userId, notice);
  await audit({ actor, action: `STATUS_${to}`, entityType: "Rider", entityId: rider.id, riderId: rider.id, meta: { from: rider.status, reason: reason || undefined } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Status updated." };
}

export async function messageRider(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const rider = await db.rider.findUnique({ where: { id: text(fd, "riderId") } });
  const message = text(fd, "message");
  if (!rider) return { error: "Rider not found." };
  if (message.length < 3 || message.length > 500) return { error: "Message must be 3–500 characters." };
  await notify(rider.userId, { kind: "ACTION", title: { en: "Message from Nucleus Fleet", de: "Nachricht von Nucleus Fleet" }, body: { en: message, de: message } });
  await audit({ actor, action: "RIDER_MESSAGED", entityType: "Rider", entityId: rider.id, riderId: rider.id, meta: { message } });
  revalidatePath(`/admin/riders/${rider.id}`);
  return { ok: true, message: "Sent." };
}

export async function saveInternalNote(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const riderId = text(fd, "riderId");
  await db.rider.update({ where: { id: riderId }, data: { internalNote: text(fd, "note").slice(0, 2000) || null } });
  await audit({ actor, action: "NOTE_SAVED", entityType: "Rider", entityId: riderId, riderId });
  revalidatePath(`/admin/riders/${riderId}`);
  return { ok: true, message: "Saved." };
}

export async function setWorkAuthorization(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const riderId = text(fd, "riderId");
  const value = text(fd, "workAuthorization");
  if (!(value in WORK_AUTH)) return { error: "Invalid value." };
  await db.rider.update({ where: { id: riderId }, data: { workAuthorization: value } });
  await audit({ actor, action: "WORK_AUTH_SET", entityType: "Rider", entityId: riderId, riderId, meta: { value } });
  revalidatePath(`/admin/riders/${riderId}`);
  return { ok: true, message: "Saved." };
}

export async function logWork(fd: FormData): Promise<FormState> {
  const { actor } = await staff();
  const riderId = text(fd, "riderId");
  const date = parseDateInput(fd.get("date"));
  const hours = Number(text(fd, "hours").replace(",", "."));
  if (!date) return { error: "Enter a valid date." };
  if (date.getTime() > Date.now() + 86_400_000) return { error: "Work days cannot be in the future." };
  if (!Number.isFinite(hours) || hours <= 0 || hours > 16) return { error: "Hours must be between 0 and 16." };
  await db.workLog.upsert({
    where: { riderId_date: { riderId, date } },
    create: { riderId, date, hours, note: text(fd, "note").slice(0, 200) || null, createdByName: actor.name },
    update: { hours, note: text(fd, "note").slice(0, 200) || null, createdByName: actor.name },
  });
  await audit({ actor, action: "WORK_LOGGED", entityType: "WorkLog", entityId: riderId, riderId, meta: { date: date.toISOString().slice(0, 10), hours } });
  revalidatePath(`/admin/riders/${riderId}`);
  revalidatePath("/admin/compliance");
  return { ok: true, message: "Logged." };
}

export async function deleteWorkLog(fd: FormData): Promise<void> {
  const { actor } = await staff();
  const log = await db.workLog.findUnique({ where: { id: text(fd, "id") } });
  if (!log) return;
  await db.workLog.delete({ where: { id: log.id } });
  await audit({ actor, action: "WORK_LOG_DELETED", entityType: "WorkLog", entityId: log.id, riderId: log.riderId, meta: { date: log.date.toISOString().slice(0, 10), hours: log.hours } });
  revalidatePath(`/admin/riders/${log.riderId}`);
  revalidatePath("/admin/compliance");
}

export interface PayrollReveal {
  error?: string;
  taxId?: string | null;
  svNumber?: string | null;
  iban?: string | null;
}

/** Admin-only. Every reveal is written to the audit log. */
export async function revealPayroll(riderId: string): Promise<PayrollReveal> {
  const admin = await requireAdmin();
  const rider = await db.rider.findUnique({ where: { id: riderId } });
  if (!rider) return { error: "Rider not found." };
  await audit({ actor: { id: admin.id, name: admin.name }, action: "PAYROLL_REVEALED", entityType: "Rider", entityId: rider.id, riderId: rider.id });
  return { taxId: decryptField(rider.taxIdEnc), svNumber: decryptField(rider.svNumberEnc), iban: decryptField(rider.ibanEnc) };
}

/** Removes an applicant who never started work. Employees fall under statutory retention duties. */
export async function eraseRider(fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const rider = await db.rider.findUnique({ where: { id: text(fd, "riderId") }, include: { user: true, documents: true } });
  if (!rider) return { error: "Rider not found." };
  if (rider.activatedAt) return { error: "This rider has worked for us — payroll and residence-permit records must be retained by law. Offboard instead." };
  if (text(fd, "confirmEmail").toLowerCase() !== rider.user.email.toLowerCase()) return { error: "Type the rider's email address to confirm." };

  for (const d of rider.documents) if (d.storageKey) await deleteFile(d.storageKey);
  await db.auditLog.updateMany({ where: { actorId: rider.userId }, data: { actorName: "Erased user" } });
  await db.user.delete({ where: { id: rider.userId } });
  await audit({ actor: { id: admin.id, name: admin.name }, action: "RIDER_ERASED", entityType: "Rider", entityId: rider.id, meta: { name: "erased" } });
  revalidatePath("/admin", "layout");
  redirect("/admin/riders");
}

/** No email reset exists yet, so an admin issues a one-time temporary password; the rider must replace it at next sign-in. */
export async function resetRiderPassword(fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const rider = await db.rider.findUnique({ where: { id: text(fd, "riderId") }, include: { user: true } });
  if (!rider) return { error: "Rider not found." };
  const password = temporaryPassword();
  await db.user.update({ where: { id: rider.userId }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } });
  await audit({ actor: { id: admin.id, name: admin.name }, action: "RIDER_PASSWORD_RESET", entityType: "Rider", entityId: rider.id, riderId: rider.id });
  return { ok: true, message: `Temporary password (shown once): ${password}` };
}

export async function markDeletionHandled(fd: FormData): Promise<void> {
  const { actor } = await staff();
  const riderId = text(fd, "riderId");
  await db.rider.update({ where: { id: riderId }, data: { deletionRequestedAt: null } });
  await audit({ actor, action: "DELETION_REQUEST_DISMISSED", entityType: "Rider", entityId: riderId, riderId });
  revalidatePath(`/admin/riders/${riderId}`);
}
