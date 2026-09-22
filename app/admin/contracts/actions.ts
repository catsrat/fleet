"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { EMPLOYMENT_TYPES, type EmploymentType } from "@/lib/constants";
import { CONTRACT_VERSION, buildContractPdf } from "@/lib/contract";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { requireAdmin } from "@/lib/session";
import { putFile } from "@/lib/storage";
import { parseDateInput } from "@/lib/validators";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

/** Generates the contract PDF from the rider's own details and publishes it to their portal. */
export async function issueContract(fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const rider = await db.rider.findUnique({ where: { id: text(fd, "riderId") } });
  if (!rider) return { error: "Rider not found." };
  if (!["APPROVED", "UBER_ONBOARDING", "ACTIVE"].includes(rider.status)) {
    return { error: "Issue the contract once the rider is approved." };
  }

  const employmentType = (text(fd, "employmentType") || rider.employmentType) as EmploymentType;
  if (!employmentType || !(employmentType in EMPLOYMENT_TYPES)) return { error: "Choose the employment type." };

  const startDate = parseDateInput(fd.get("startDate"));
  if (!startDate) return { error: "Choose the start date." };

  const hourly = text(fd, "hourly").replace(",", ".");
  let hourlyCents: number | null = null;
  if (hourly) {
    const value = Number(hourly);
    if (!Number.isFinite(value) || value <= 0 || value > 200) return { error: "Enter an hourly rate between 0 and 200 euro, or leave it blank." };
    hourlyCents = Math.round(value * 100);
  }

  const pdf = buildContractPdf({ rider, employmentType, startDate, hourlyCents });
  const storageKey = await putFile(pdf);
  const previous = await db.contract.count({ where: { riderId: rider.id, supersededAt: null } });

  const contract = await db.$transaction(async (tx) => {
    await tx.contract.updateMany({ where: { riderId: rider.id, supersededAt: null }, data: { supersededAt: new Date() } });
    if (rider.employmentType !== employmentType) await tx.rider.update({ where: { id: rider.id }, data: { employmentType } });
    return tx.contract.create({
      data: { riderId: rider.id, version: CONTRACT_VERSION, employmentType, storageKey, sha256: sha256(pdf), sizeBytes: pdf.length, generatedByName: admin.name },
    });
  });

  await notify(rider.userId, {
    kind: "ACTION",
    path: "/apply/contract",
    title: previous ? { en: "Your contract was updated", de: "Dein Vertrag wurde aktualisiert" } : { en: "Your employment contract is ready", de: "Dein Arbeitsvertrag liegt bereit" },
    body: {
      en: "Open it in your account, read it, and confirm to accept.",
      de: "Öffne ihn in deinem Konto, lies ihn und bestätige ihn.",
    },
  });
  await audit({ actor: { id: admin.id, name: admin.name }, action: previous ? "CONTRACT_REISSUED" : "CONTRACT_ISSUED", entityType: "Contract", entityId: contract.id, riderId: rider.id, meta: { employmentType } });
  revalidatePath(`/admin/riders/${rider.id}`);
  return { ok: true, message: previous ? "New version issued." : "Contract issued." };
}
