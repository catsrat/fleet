import type { Contract } from "@prisma/client";

/**
 * Where a contract has got to in the signed round trip:
 *   ISSUED       we generated it and the rider has to sign and send it back
 *   RIDER_SIGNED the rider uploaded their signed copy; we still have to countersign
 *   COMPLETE     both sides signed and the rider can download the executed copy
 */
export type ContractStage = "ISSUED" | "RIDER_SIGNED" | "COMPLETE";

type StageFields = Pick<Contract, "riderSignedAt" | "countersignedAt">;

export function contractStage(c: StageFields): ContractStage {
  if (c.countersignedAt) return "COMPLETE";
  if (c.riderSignedAt) return "RIDER_SIGNED";
  return "ISSUED";
}

/** The three stored files. "countersigned" is the one that matters once it exists. */
export type ContractCopy = "original" | "signed" | "countersigned";

export const CONTRACT_COPIES: readonly ContractCopy[] = ["original", "signed", "countersigned"];

export function isContractCopy(v: string | null | undefined): v is ContractCopy {
  return !!v && (CONTRACT_COPIES as readonly string[]).includes(v);
}

type CopyFields = Pick<Contract, "storageKey" | "riderSignedKey" | "countersignedKey">;

export function contractCopyKey(c: CopyFields, copy: ContractCopy): string | null {
  const key = copy === "signed" ? c.riderSignedKey : copy === "countersigned" ? c.countersignedKey : c.storageKey;
  return key || null;
}

/** Filename suffix so the rider can tell the three copies apart in their downloads folder. */
export function contractCopySuffix(copy: ContractCopy): string {
  return copy === "signed" ? "-unterschrieben" : copy === "countersigned" ? "-gegengezeichnet" : "";
}
