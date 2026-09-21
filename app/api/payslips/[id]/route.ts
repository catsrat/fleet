import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { KIND_LABEL, periodLabel, isPayslipKind } from "@/lib/payslips";
import { isAdminRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";
import { getFile } from "@/lib/storage";

/** A rider can open only their own payslips; admins and the owner can open any. Reviewers cannot open payslips at all. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const payslip = await db.payslip.findUnique({ where: { id }, include: { rider: { select: { id: true, userId: true } } } });
  const isAdmin = isAdminRole(user.role);
  const isOwnerOfDoc = !!payslip && payslip.rider.userId === user.id;
  // Riders never see superseded versions; a foreign id looks identical to a missing one.
  if (!payslip || (!isAdmin && (!isOwnerOfDoc || payslip.supersededAt))) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await getFile(payslip.storageKey);
  } catch {
    return new Response("File unavailable", { status: 404 });
  }

  if (isOwnerOfDoc) {
    await db.payslip.update({
      where: { id: payslip.id },
      data: { downloadCount: { increment: 1 }, firstDownloadedAt: payslip.firstDownloadedAt ?? new Date() },
    });
  } else {
    await audit({
      actor: { id: user.id, name: user.name }, action: "PAYSLIP_VIEWED", entityType: "Payslip", entityId: payslip.id, riderId: payslip.rider.id,
      meta: { kind: payslip.kind, year: payslip.year, month: payslip.month },
    });
  }

  const kind = isPayslipKind(payslip.kind) ? payslip.kind : "PAYSLIP";
  const stem = `${KIND_LABEL[kind].de}_${periodLabel(kind, payslip.year, payslip.month, "en").replace(/\s+/g, "-")}`.replace(/[^\w-]/g, "");
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${stem}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
