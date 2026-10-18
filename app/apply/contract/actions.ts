"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { contractStage } from "@/lib/contract-stage";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/limits";
import { getLocale, tr } from "@/lib/locale";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireRider } from "@/lib/session";
import { putFile, sniffMime } from "@/lib/storage";

/**
 * The rider uploads the contract they signed. That upload is the acceptance, so it records the same
 * time, account and address the old tick-box confirmation did — a signed copy is simply better evidence.
 */
export async function uploadSignedContract(fd: FormData): Promise<FormState> {
  const user = await requireRider();
  const locale = await getLocale();

  const contract = await db.contract.findFirst({ where: { riderId: user.rider.id, supersededAt: null }, orderBy: { generatedAt: "desc" } });
  if (!contract) return { error: tr(locale, "There is no contract to sign.", "Es liegt kein Vertrag zur Unterschrift vor.") };
  if (contractStage(contract) !== "ISSUED") {
    return { error: tr(locale, "You have already sent your signed copy.", "Du hast deine unterschriebene Fassung bereits gesendet.") };
  }

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: tr(locale, "Please choose your signed contract.", "Bitte wähle deinen unterschriebenen Vertrag aus.") };
  if (file.size > MAX_UPLOAD_BYTES) return { error: tr(locale, `File is too large (max ${MAX_UPLOAD_LABEL}).`, `Datei ist zu groß (max. ${MAX_UPLOAD_LABEL}).`) };
  if (!(await rateLimit(`contract-sign:${user.id}`, 10, 60 * 60_000)).ok) {
    return { error: tr(locale, "Too many uploads. Please try again in a while.", "Zu viele Uploads. Bitte versuche es später erneut.") };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (sniffMime(buffer) !== "application/pdf") {
    return { error: tr(locale, "Please upload the signed contract as a PDF.", "Bitte lade den unterschriebenen Vertrag als PDF hoch.") };
  }

  const storageKey = await putFile(buffer);
  const now = new Date();
  await db.contract.update({
    where: { id: contract.id },
    data: {
      riderSignedKey: storageKey,
      riderSignedAt: now,
      riderSignedSha256: sha256(buffer),
      riderSignedSizeBytes: buffer.length,
      acknowledgedAt: contract.acknowledgedAt ?? now,
      acknowledgedIp: contract.acknowledgedIp ?? (await clientIp()),
    },
  });

  await audit({ actor: { id: user.id, name: user.name }, action: "CONTRACT_SIGNED_BY_RIDER", entityType: "Contract", entityId: contract.id, riderId: user.rider.id });
  revalidatePath("/apply/contract");
  revalidatePath("/admin", "layout");
  return { ok: true, message: tr(locale, "Thank you. We'll countersign it and send your copy back.", "Danke. Wir gegenzeichnen ihn und schicken dir deine Ausfertigung zurück.") };
}
