import { audit } from "@/lib/audit";
import { contractCopyKey, contractCopySuffix, isContractCopy, type ContractCopy } from "@/lib/contract-stage";
import { db } from "@/lib/db";
import { isAdminRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";
import { getFile } from "@/lib/storage";

/**
 * A rider can open their own contract; admins and the owner can open any. Reviewers cannot.
 * `?copy=signed` serves the rider's signed upload and `?copy=countersigned` the fully executed one;
 * without it you get the copy we generated.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const contract = await db.contract.findUnique({ where: { id }, include: { rider: { select: { id: true, userId: true } } } });
  const isAdmin = isAdminRole(user.role);
  const isOwnDocument = !!contract && contract.rider.userId === user.id;
  if (!contract || (!isAdmin && !isOwnDocument)) return new Response("Not found", { status: 404 });

  const params = new URL(req.url).searchParams;
  const requested = params.get("copy");
  let copy: ContractCopy = "original";
  if (requested) {
    if (!isContractCopy(requested)) return new Response("Not found", { status: 404 });
    copy = requested;
  }

  const key = contractCopyKey(contract, copy);
  if (!key) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await getFile(key);
  } catch {
    return new Response("File unavailable", { status: 404 });
  }

  if (!isOwnDocument) {
    await audit({ actor: { id: user.id, name: user.name }, action: "CONTRACT_VIEWED", entityType: "Contract", entityId: contract.id, riderId: contract.rider.id, meta: { copy } });
  }

  const download = params.get("download") === "1";
  const filename = `Arbeitsvertrag-v${contract.version}${contractCopySuffix(copy)}.pdf`;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
