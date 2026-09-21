"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { ALL_NATIONALITIES, CITIES, EXPIRY_WARNING_DAYS, nationalityGroupFor } from "@/lib/constants";
import { encryptField, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { DOC_TYPES, applicableDocTypes, type DocType } from "@/lib/documents";
import { getLocale, tr } from "@/lib/locale";
import { rateLimit } from "@/lib/rate-limit";
import { currentDocs, daysUntil, docState, evaluate, refreshPipelineStatus } from "@/lib/rider";
import { requireRider } from "@/lib/session";
import { MAX_UPLOAD_BYTES, deleteFile, putFile, sniffMime } from "@/lib/storage";
import {
  isAdult,
  isValidIban,
  isValidSteuerId,
  isValidSvNumber,
  normalizeIban,
  parseDateInput,
} from "@/lib/validators";

const EDITABLE = ["DRAFT", "SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED"];
const CLOSED = ["OFFBOARDED", "REJECTED"];

async function ctx() {
  const user = await requireRider();
  const locale = await getLocale();
  return { user, rider: user.rider, locale, actor: { id: user.id, name: user.name } };
}

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const done = (locale: "en" | "de"): FormState => ({ ok: true, message: tr(locale, "Saved.", "Gespeichert.") });

function lockedError(locale: "en" | "de"): FormState {
  return { error: tr(locale, "This section is locked while your application is being processed. Contact support to change it.", "Dieser Abschnitt ist gesperrt, solange deine Bewerbung bearbeitet wird. Wende dich an den Support.") };
}

export async function saveProfile(fd: FormData): Promise<FormState> {
  const { rider, locale, actor } = await ctx();
  if (!EDITABLE.includes(rider.status)) return lockedError(locale);

  const parsed = z
    .object({
      phone: z.string().regex(/^\+?[0-9 ()\-/]{7,22}$/),
      city: z.enum(CITIES),
      nationality: z.string().refine((v) => ALL_NATIONALITIES.includes(v)),
      university: z.string().min(2).max(120),
    })
    .safeParse({ phone: text(fd, "phone"), city: text(fd, "city"), nationality: text(fd, "nationality"), university: text(fd, "university") });
  const dob = parseDateInput(fd.get("dateOfBirth"));
  if (!parsed.success || !dob) {
    return { error: tr(locale, "Please check all fields — phone number, date of birth, city, nationality and university are required.", "Bitte prüfe alle Felder – Handynummer, Geburtsdatum, Stadt, Staatsangehörigkeit und Universität sind Pflicht.") };
  }
  if (!isAdult(dob)) return { error: tr(locale, "You must be at least 18 years old to ride.", "Du musst mindestens 18 Jahre alt sein.") };

  await db.rider.update({
    where: { id: rider.id },
    data: { ...parsed.data, dateOfBirth: dob, nationalityGroup: nationalityGroupFor(parsed.data.nationality) },
  });
  await audit({ actor, action: "PROFILE_SAVED", entityType: "Rider", entityId: rider.id, riderId: rider.id });
  revalidatePath("/apply");
  return done(locale);
}

export async function saveIdType(fd: FormData): Promise<FormState> {
  const { rider, locale, actor } = await ctx();
  if (!EDITABLE.includes(rider.status)) return lockedError(locale);
  const idType = text(fd, "idType") === "PASSPORT" ? "PASSPORT" : "ID_CARD";
  await db.rider.update({ where: { id: rider.id }, data: { idType } });
  await audit({ actor, action: "ID_TYPE_SET", entityType: "Rider", entityId: rider.id, riderId: rider.id, meta: { idType } });
  revalidatePath("/apply");
  return done(locale);
}

export async function savePermitDeclaration(fd: FormData): Promise<FormState> {
  const { rider, locale, actor } = await ctx();
  if (!EDITABLE.includes(rider.status)) return lockedError(locale);
  if (rider.nationalityGroup !== "NON_EU") return { error: tr(locale, "Not required for your nationality.", "Für deine Staatsangehörigkeit nicht erforderlich.") };
  const days = Number(text(fd, "priorDays").replace(",", "."));
  if (!Number.isFinite(days) || days < 0 || days > 140 || (days * 2) % 1 !== 0) {
    return { error: tr(locale, "Enter a number of days between 0 and 140 (steps of 0.5).", "Gib eine Zahl zwischen 0 und 140 ein (in 0,5er-Schritten).") };
  }
  if (fd.get("confirm") !== "on") return { error: tr(locale, "Please confirm the declaration.", "Bitte bestätige die Erklärung.") };
  await db.rider.update({ where: { id: rider.id }, data: { priorDaysWorked: days, priorDaysDeclaredAt: new Date() } });
  await audit({ actor, action: "PRIOR_DAYS_DECLARED", entityType: "Rider", entityId: rider.id, riderId: rider.id, meta: { days } });
  revalidatePath("/apply");
  return done(locale);
}

export async function savePayroll(fd: FormData): Promise<FormState> {
  const { rider, locale, actor } = await ctx();
  if (CLOSED.includes(rider.status)) return lockedError(locale);

  const taxId = text(fd, "taxId");
  const sv = text(fd, "svNumber");
  const svPending = fd.get("svPending") === "on";
  const iban = text(fd, "iban");
  const insurer = text(fd, "healthInsurer");
  const data: Record<string, string | boolean | null> = {};

  if (taxId) {
    if (!isValidSteuerId(taxId)) return { error: tr(locale, "That tax ID doesn't look right — it has 11 digits. Please check for typos.", "Diese Steuer-ID scheint nicht zu stimmen – sie hat 11 Ziffern. Bitte auf Tippfehler prüfen.") };
    data.taxIdEnc = encryptField(taxId.replace(/[\s.-]/g, ""));
  } else if (!rider.taxIdEnc) {
    return { error: tr(locale, "Please enter your tax ID.", "Bitte gib deine Steuer-ID ein.") };
  }

  if (svPending) {
    data.svNumberEnc = null;
    data.svPending = true;
  } else if (sv) {
    if (!isValidSvNumber(sv)) return { error: tr(locale, "That social security number doesn't look right (12 characters, e.g. 15 070649 C 103).", "Diese Sozialversicherungsnummer scheint nicht zu stimmen (12 Zeichen, z. B. 15 070649 C 103).") };
    data.svNumberEnc = encryptField(sv.replace(/\s+/g, "").toUpperCase());
    data.svPending = false;
  } else if (!rider.svNumberEnc && !rider.svPending) {
    return { error: tr(locale, "Enter your social security number or tick \"I don't have one yet\".", "Gib deine Sozialversicherungsnummer ein oder wähle „Ich habe noch keine“.") };
  }

  if (iban) {
    if (!isValidIban(iban)) return { error: tr(locale, "That IBAN isn't valid. Please check for typos.", "Diese IBAN ist ungültig. Bitte auf Tippfehler prüfen.") };
    data.ibanEnc = encryptField(normalizeIban(iban));
  } else if (!rider.ibanEnc) {
    return { error: tr(locale, "Please enter your IBAN.", "Bitte gib deine IBAN ein.") };
  }

  if (insurer.length < 2 || insurer.length > 80) return { error: tr(locale, "Please enter your health insurer.", "Bitte gib deine Krankenkasse an.") };
  data.healthInsurer = insurer;

  await db.rider.update({ where: { id: rider.id }, data });
  await audit({ actor, action: "PAYROLL_SAVED", entityType: "Rider", entityId: rider.id, riderId: rider.id });
  revalidatePath("/apply");
  return done(locale);
}

export async function saveBike(fd: FormData): Promise<FormState> {
  const { rider, locale, actor } = await ctx();
  if (!EDITABLE.includes(rider.status)) return lockedError(locale);
  const bikeMode = text(fd, "bikeMode") === "OWN_BIKE" ? "OWN_BIKE" : "FLEET_BIKE";
  await db.rider.update({ where: { id: rider.id }, data: { bikeMode } });
  await audit({ actor, action: "BIKE_MODE_SET", entityType: "Rider", entityId: rider.id, riderId: rider.id, meta: { bikeMode } });
  revalidatePath("/apply");
  return done(locale);
}

export async function saveAgreements(fd: FormData): Promise<FormState> {
  const { rider, locale, actor } = await ctx();
  if (!EDITABLE.includes(rider.status)) return lockedError(locale);
  if (fd.get("consent") !== "on" || fd.get("contract") !== "on" || fd.get("conduct") !== "on") {
    return { error: tr(locale, "Please accept all three agreements to continue.", "Bitte akzeptiere alle drei Vereinbarungen, um fortzufahren.") };
  }
  const now = new Date();
  await db.rider.update({
    where: { id: rider.id },
    data: { consentDataAt: rider.consentDataAt ?? now, contractAckAt: rider.contractAckAt ?? now, conductAckAt: rider.conductAckAt ?? now },
  });
  await audit({ actor, action: "AGREEMENTS_ACCEPTED", entityType: "Rider", entityId: rider.id, riderId: rider.id });
  revalidatePath("/apply");
  return done(locale);
}

export async function uploadDocument(fd: FormData): Promise<FormState> {
  const { user, rider, locale, actor } = await ctx();
  const type = text(fd, "type") as DocType;
  const file = fd.get("file");

  if (!DOC_TYPES.includes(type) || !applicableDocTypes(rider).includes(type)) {
    return { error: tr(locale, "That document isn't needed for you.", "Dieses Dokument wird bei dir nicht benötigt.") };
  }
  if (!(file instanceof File) || file.size === 0) return { error: tr(locale, "Please choose a file.", "Bitte wähle eine Datei.") };
  if (file.size > MAX_UPLOAD_BYTES) return { error: tr(locale, "File is too large (max 10 MB).", "Datei ist zu groß (max. 10 MB).") };
  if (CLOSED.includes(rider.status)) return lockedError(locale);
  if (!rateLimit(`upload:${user.id}`, 60, 60 * 60_000).ok) {
    return { error: tr(locale, "Too many uploads. Please try again in a while.", "Zu viele Uploads. Bitte versuche es später erneut.") };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffMime(buffer);
  if (!mimeType) return { error: tr(locale, "Unsupported file. Please upload a JPG, PNG, WebP or PDF.", "Nicht unterstützte Datei. Bitte lade JPG, PNG, WebP oder PDF hoch.") };

  const existing = await db.document.findMany({ where: { riderId: rider.id, type, status: { not: "SUPERSEDED" } } });
  const latest = currentDocs(existing).get(type);
  const state = docState(latest);
  const expiringSoon = !!latest?.expiresAt && daysUntil(latest.expiresAt) <= EXPIRY_WARNING_DAYS;
  const mayReplace = !latest || state !== "APPROVED" || expiringSoon;
  if (!mayReplace) {
    return { error: tr(locale, "This document is already approved. No new upload is needed.", "Dieses Dokument ist bereits freigegeben. Ein neuer Upload ist nicht nötig.") };
  }
  if (!EDITABLE.includes(rider.status) && !(state === "REJECTED" || state === "EXPIRED" || expiringSoon)) return lockedError(locale);

  const storageKey = await putFile(buffer);
  const stale = existing.filter((d) => d.status !== "APPROVED" || state === "EXPIRED");
  const created = await db.$transaction(async (tx) => {
    if (stale.length) await tx.document.updateMany({ where: { id: { in: stale.map((d) => d.id) } }, data: { status: "SUPERSEDED" } });
    return tx.document.create({
      data: {
        riderId: rider.id,
        type,
        storageKey,
        originalName: file.name.slice(0, 160),
        mimeType,
        sizeBytes: buffer.length,
        sha256: sha256(buffer),
      },
    });
  });

  // Files that were never approved carry no retention duty: drop the blob, keep the metadata row.
  for (const d of stale.filter((s) => s.status !== "APPROVED" && s.storageKey)) {
    await deleteFile(d.storageKey);
    await db.document.update({ where: { id: d.id }, data: { storageKey: "" } });
  }

  await audit({ actor, action: "DOCUMENT_UPLOADED", entityType: "Document", entityId: created.id, riderId: rider.id, meta: { type, bytes: buffer.length, mimeType } });
  await refreshPipelineStatus(rider.id);
  revalidatePath("/apply");
  return { ok: true, message: tr(locale, "Uploaded — we'll review it soon.", "Hochgeladen – wir prüfen es bald.") };
}

export async function submitApplication(): Promise<FormState> {
  const { rider, locale, actor } = await ctx();
  if (rider.status !== "DRAFT") return { error: tr(locale, "Your application was already submitted.", "Deine Bewerbung wurde bereits eingereicht.") };
  const docs = await db.document.findMany({ where: { riderId: rider.id } });
  if (!evaluate(rider, docs).canSubmit) {
    return { error: tr(locale, "Please complete every section first.", "Bitte schließe zuerst alle Abschnitte ab.") };
  }
  await db.rider.update({ where: { id: rider.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  await audit({ actor, action: "APPLICATION_SUBMITTED", entityType: "Rider", entityId: rider.id, riderId: rider.id });
  await refreshPipelineStatus(rider.id);
  revalidatePath("/apply");
  return { ok: true };
}

export async function markNotificationsRead(): Promise<void> {
  const { user } = await ctx();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/apply");
}

export async function requestDeletion(): Promise<FormState> {
  const { rider, locale, actor } = await ctx();
  await db.rider.update({ where: { id: rider.id }, data: { deletionRequestedAt: new Date() } });
  await audit({ actor, action: "DELETION_REQUESTED", entityType: "Rider", entityId: rider.id, riderId: rider.id });
  revalidatePath("/apply");
  return { ok: true, message: tr(locale, "Deletion requested — our team will contact you.", "Löschung beantragt – unser Team meldet sich bei dir.") };
}
