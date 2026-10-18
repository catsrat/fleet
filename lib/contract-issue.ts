import type { Rider } from "@prisma/client";
import { audit } from "./audit";
import { EMPLOYMENT_TYPES, employerDetailsComplete, type EmploymentType } from "./constants";
import { CONTRACT_VERSION, buildContractPdf } from "./contract";
import { sha256 } from "./crypto";
import { db } from "./db";
import { notify } from "./notify";
import { putFile } from "./storage";
import { parseDateInput } from "./validators";

/**
 * Issuing a contract, shared by the "issue contract" button and by approval, which issues one
 * automatically. These live outside the server-action files: a "use server" module may only export
 * async functions, and everything it exports becomes a callable endpoint.
 */

export interface IssueContractInput {
  rider: Rider;
  employmentType: EmploymentType;
  startDate: Date;
  hourlyCents: number | null;
  actor: { id: string; name: string };
}

export interface ContractTerms {
  employmentType: EmploymentType;
  startDate: Date;
  hourlyCents: number;
}

/**
 * Reads and validates the employment terms from a form. It also refuses to let a contract be issued
 * at all while the employer's own name and address are missing from `COMPANY.employer`: § 2 NachwG
 * requires both, and a contract that prints a blank where the employer belongs is worse than none.
 */
export function readContractTerms(fd: FormData, fallbackType?: string | null): ContractTerms | { error: string } {
  if (!employerDetailsComplete()) {
    return { error: "Set the employer's registered name and address in lib/constants.ts before issuing contracts (§ 2 NachwG requires both)." };
  }

  const employmentType = (String(fd.get("employmentType") ?? "").trim() || fallbackType || "") as EmploymentType;
  if (!employmentType || !(employmentType in EMPLOYMENT_TYPES)) return { error: "Choose the employment type." };

  const startDate = parseDateInput(fd.get("startDate"));
  if (!startDate) return { error: "Choose the start date." };

  const hourly = String(fd.get("hourly") ?? "").trim().replace(",", ".");
  if (!hourly) return { error: "Enter the hourly rate — the contract has to state it (§ 2 NachwG)." };
  const value = Number(hourly);
  if (!Number.isFinite(value) || value <= 0 || value > 200) return { error: "Enter an hourly rate between 0 and 200 euro." };

  return { employmentType, startDate, hourlyCents: Math.round(value * 100) };
}

/** Generates the contract PDF, supersedes any previous one and tells the rider to sign it. */
export async function createContract(i: IssueContractInput): Promise<{ id: string; reissued: boolean }> {
  const pdf = buildContractPdf({ rider: i.rider, employmentType: i.employmentType, startDate: i.startDate, hourlyCents: i.hourlyCents });
  const storageKey = await putFile(pdf);
  const previous = await db.contract.count({ where: { riderId: i.rider.id, supersededAt: null } });

  const contract = await db.$transaction(async (tx) => {
    await tx.contract.updateMany({ where: { riderId: i.rider.id, supersededAt: null }, data: { supersededAt: new Date() } });
    if (i.rider.employmentType !== i.employmentType) await tx.rider.update({ where: { id: i.rider.id }, data: { employmentType: i.employmentType } });
    return tx.contract.create({
      data: {
        riderId: i.rider.id,
        version: CONTRACT_VERSION,
        employmentType: i.employmentType,
        storageKey,
        sha256: sha256(pdf),
        sizeBytes: pdf.length,
        generatedByName: i.actor.name,
      },
    });
  });

  await notify(i.rider.userId, {
    kind: "ACTION",
    path: "/apply/contract",
    title: previous ? { en: "Your contract was updated", de: "Dein Vertrag wurde aktualisiert" } : { en: "Your employment contract is ready", de: "Dein Arbeitsvertrag liegt bereit" },
    body: {
      en: "Open it in your account, read it, print and sign it, then upload the signed copy. We countersign it and send it back.",
      de: "Öffne ihn in deinem Konto, lies ihn, drucke ihn aus und unterschreibe ihn. Lade die unterschriebene Fassung anschließend hoch. Wir gegenzeichnen sie und schicken sie dir zurück.",
    },
  });
  await audit({
    actor: i.actor,
    action: previous ? "CONTRACT_REISSUED" : "CONTRACT_ISSUED",
    entityType: "Contract",
    entityId: contract.id,
    riderId: i.rider.id,
    meta: { employmentType: i.employmentType },
  });
  return { id: contract.id, reissued: previous > 0 };
}
