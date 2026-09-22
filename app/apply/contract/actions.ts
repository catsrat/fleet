"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getLocale, tr } from "@/lib/locale";
import { clientIp } from "@/lib/rate-limit";
import { requireRider } from "@/lib/session";

/** The rider confirms they have read and accept the contract. Time, account and address are recorded. */
export async function acknowledgeContract(fd: FormData): Promise<FormState> {
  const user = await requireRider();
  const locale = await getLocale();

  if (fd.get("confirm") !== "on") {
    return { error: tr(locale, "Please tick the box to confirm you accept the contract.", "Bitte bestätige mit dem Häkchen, dass du den Vertrag annimmst.") };
  }

  const contract = await db.contract.findFirst({ where: { riderId: user.rider.id, supersededAt: null }, orderBy: { generatedAt: "desc" } });
  if (!contract) return { error: tr(locale, "There is no contract to confirm.", "Es liegt kein Vertrag zur Bestätigung vor.") };
  if (contract.acknowledgedAt) return { ok: true };

  const now = new Date();
  await db.$transaction([
    db.contract.update({ where: { id: contract.id }, data: { acknowledgedAt: now, acknowledgedIp: await clientIp() } }),
    db.rider.update({ where: { id: user.rider.id }, data: { contractAckAt: user.rider.contractAckAt ?? now } }),
  ]);
  await audit({ actor: { id: user.id, name: user.name }, action: "CONTRACT_ACKNOWLEDGED", entityType: "Contract", entityId: contract.id, riderId: user.rider.id });
  revalidatePath("/apply/contract");
  return { ok: true, message: tr(locale, "Confirmed. Thank you.", "Bestätigt. Vielen Dank.") };
}
