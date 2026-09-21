import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isStaffRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";
import { getFile } from "@/lib/storage";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const doc = await db.document.findUnique({ where: { id }, include: { rider: { select: { id: true, userId: true } } } });
  const isStaff = isStaffRole(user.role);
  // Riders only ever see their own files; a foreign id looks identical to a missing one.
  if (!doc || (!isStaff && doc.rider.userId !== user.id)) return new Response("Not found", { status: 404 });
  if (!doc.storageKey) return new Response("This file has been removed.", { status: 410 });

  let data: Buffer;
  try {
    data = await getFile(doc.storageKey);
  } catch {
    return new Response("File unavailable", { status: 404 });
  }

  if (isStaff) {
    await audit({
      actor: { id: user.id, name: user.name },
      action: "DOCUMENT_VIEWED",
      entityType: "Document",
      entityId: doc.id,
      riderId: doc.rider.id,
      meta: { type: doc.type },
    });
  }

  const download = new URL(req.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": doc.mimeType,
    "Content-Length": String(data.length),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.type.toLowerCase()}-${doc.id}.${EXT[doc.mimeType] ?? "bin"}"`,
  };
  if (doc.mimeType !== "application/pdf") headers["Content-Security-Policy"] = "default-src 'none'; sandbox";

  return new Response(new Uint8Array(data), { headers });
}
