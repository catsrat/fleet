import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isAdminRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";
import { getFile } from "@/lib/storage";

/** A rider can open their own contract; admins and the owner can open any. Reviewers cannot. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const contract = await db.contract.findUnique({ where: { id }, include: { rider: { select: { id: true, userId: true } } } });
  const isAdmin = isAdminRole(user.role);
  const isOwnDocument = !!contract && contract.rider.userId === user.id;
  if (!contract || (!isAdmin && !isOwnDocument)) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await getFile(contract.storageKey);
  } catch {
    return new Response("File unavailable", { status: 404 });
  }

  if (!isOwnDocument) {
    await audit({ actor: { id: user.id, name: user.name }, action: "CONTRACT_VIEWED", entityType: "Contract", entityId: contract.id, riderId: contract.rider.id });
  }

  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="Arbeitsvertrag-v${contract.version}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
