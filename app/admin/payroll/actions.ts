"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { KIND_LABEL, MAX_PAYSLIP_BYTES, isPayslipKind, periodLabel, validPeriod } from "@/lib/payslips";
import { requireAdmin } from "@/lib/session";
import { deleteFile, putFile, sniffMime } from "@/lib/storage";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

/** Adds a payslip for one rider and period. Uploading again for the same period replaces it; the old file is kept for retention. */
export async function uploadPayslip(fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const actor = { id: admin.id, name: admin.name };
  const kind = text(fd, "kind");
  const year = Number(text(fd, "year"));
  const month = Number(text(fd, "month"));
  const file = fd.get("file");

  if (!isPayslipKind(kind) || !validPeriod(kind, year, month)) return { error: "Choose a valid period (not in the future)." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF file." };
  if (file.size > MAX_PAYSLIP_BYTES) return { error: "File is too large (max 5 MB)." };

  const rider = await db.rider.findUnique({ where: { id: text(fd, "riderId") } });
  if (!rider) return { error: "Rider not found." };
  if (!rider.activatedAt) return { error: "Payslips can only be added for riders who have started work." };

  const buffer = Buffer.from(await file.arrayBuffer());
  if (sniffMime(buffer) !== "application/pdf") return { error: "Only PDF files are accepted." };

  const storageKey = await putFile(buffer);
  const now = new Date();
  const { created, replaced } = await db.$transaction(async (tx) => {
    const old = await tx.payslip.updateMany({ where: { riderId: rider.id, kind, year, month, supersededAt: null }, data: { supersededAt: now } });
    const created = await tx.payslip.create({
      data: {
        riderId: rider.id, kind, year, month, storageKey, originalName: file.name.slice(0, 160), sizeBytes: buffer.length,
        sha256: sha256(buffer), uploadedByName: admin.name, note: text(fd, "note").slice(0, 200) || null,
      },
    });
    return { created, replaced: old.count > 0 };
  });

  const label = KIND_LABEL[kind];
  const period = { en: periodLabel(kind, year, month, "en"), de: periodLabel(kind, year, month, "de") };
  const riderUser = await db.rider.findUniqueOrThrow({ where: { id: rider.id }, select: { userId: true } });
  await notify(riderUser.userId, {
    kind: "INFO",
    title: replaced
      ? { en: `Corrected: ${label.en} ${period.en}`, de: `Korrigiert: ${label.de} ${period.de}` }
      : { en: `New ${label.en.toLowerCase()}: ${period.en}`, de: `Neue ${label.de}: ${period.de}` },
    body: { en: "You can download it under Payslips.", de: "Du kannst sie unter „Abrechnungen“ herunterladen." },
  });
  await audit({ actor, action: replaced ? "PAYSLIP_REPLACED" : "PAYSLIP_UPLOADED", entityType: "Payslip", entityId: created.id, riderId: rider.id, meta: { kind, year, month } });
  revalidatePath("/admin/payroll");
  revalidatePath(`/admin/riders/${rider.id}`);
  return { ok: true, message: replaced ? "Replaced." : "Uploaded." };
}

/** Removes a document uploaded to the wrong rider or period. Use "upload again" for corrections, which keeps history. */
export async function deletePayslip(fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const payslip = await db.payslip.findUnique({ where: { id: text(fd, "id") } });
  if (!payslip) return { error: "Not found." };
  await deleteFile(payslip.storageKey);
  await db.payslip.delete({ where: { id: payslip.id } });
  await audit({
    actor: { id: admin.id, name: admin.name }, action: "PAYSLIP_DELETED", entityType: "Payslip", entityId: payslip.id, riderId: payslip.riderId,
    meta: { kind: payslip.kind, year: payslip.year, month: payslip.month },
  });
  revalidatePath("/admin/payroll");
  revalidatePath(`/admin/riders/${payslip.riderId}`);
  return { ok: true, message: "Deleted." };
}
