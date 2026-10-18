"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { contractStage } from "@/lib/contract-stage";
import { createContract, readContractTerms } from "@/lib/contract-issue";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/limits";
import { notify } from "@/lib/notify";
import { requireAdmin } from "@/lib/session";
import { putFile, sniffMime } from "@/lib/storage";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

/** Generates the contract PDF from the rider's own details and publishes it to their portal. */
export async function issueContract(fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const rider = await db.rider.findUnique({ where: { id: text(fd, "riderId") } });
  if (!rider) return { error: "Rider not found." };
  if (!["APPROVED", "UBER_ONBOARDING", "ACTIVE"].includes(rider.status)) {
    return { error: "Issue the contract once the rider is approved." };
  }

  const terms = readContractTerms(fd, rider.employmentType);
  if ("error" in terms) return terms;

  const { reissued } = await createContract({ rider, ...terms, actor: { id: admin.id, name: admin.name } });
  revalidatePath(`/admin/riders/${rider.id}`);
  return { ok: true, message: reissued ? "New version issued. The rider has to sign it again." : "Contract issued." };
}

/** Uploads the copy we countersigned, which completes the contract and returns it to the rider. */
export async function uploadCountersignedContract(fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const contract = await db.contract.findUnique({ where: { id: text(fd, "contractId") }, include: { rider: true } });
  if (!contract) return { error: "Contract not found." };
  if (contract.supersededAt) return { error: "This version has been superseded. Countersign the current one." };
  if (contractStage(contract) === "ISSUED") return { error: "The rider has not uploaded their signed copy yet." };

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the countersigned PDF." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: `File is too large (max ${MAX_UPLOAD_LABEL}).` };

  const buffer = Buffer.from(await file.arrayBuffer());
  if (sniffMime(buffer) !== "application/pdf") return { error: "The countersigned contract has to be a PDF." };

  const storageKey = await putFile(buffer);
  await db.contract.update({
    where: { id: contract.id },
    data: {
      countersignedKey: storageKey,
      countersignedAt: new Date(),
      countersignedSha256: sha256(buffer),
      countersignedSizeBytes: buffer.length,
      countersignedByName: admin.name,
    },
  });

  await notify(contract.rider.userId, {
    kind: "SUCCESS",
    path: "/apply/contract",
    title: { en: "Your signed contract is ready", de: "Dein unterschriebener Vertrag liegt bereit" },
    body: {
      en: "We countersigned your contract. Download your copy from your account and keep it.",
      de: "Wir haben deinen Vertrag gegengezeichnet. Lade deine Ausfertigung in deinem Konto herunter und bewahre sie auf.",
    },
  });
  await audit({ actor: { id: admin.id, name: admin.name }, action: "CONTRACT_COUNTERSIGNED", entityType: "Contract", entityId: contract.id, riderId: contract.riderId });
  revalidatePath(`/admin/riders/${contract.riderId}`);
  return { ok: true, message: "Countersigned copy uploaded. The rider has been told." };
}
