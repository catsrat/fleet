import { audit } from "@/lib/audit";
import { decryptField } from "@/lib/crypto";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/** DSGVO Art. 15/20: a rider can download everything we hold about them. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER" || !user.rider) return new Response("Unauthorized", { status: 401 });

  const r = await db.rider.findUniqueOrThrow({
    where: { id: user.rider.id },
    include: { documents: true, workLogs: { orderBy: { date: "asc" } }, assignments: { include: { bike: true } } },
  });
  await audit({ actor: { id: user.id, name: user.name }, action: "DATA_EXPORTED", entityType: "Rider", entityId: r.id, riderId: r.id });

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { email: user.email, name: user.name, createdAt: user.createdAt },
    profile: {
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      dateOfBirth: r.dateOfBirth,
      city: r.city,
      nationality: r.nationality,
      university: r.university,
      idType: r.idType,
      bikeMode: r.bikeMode,
    },
    payroll: {
      taxId: decryptField(r.taxIdEnc),
      socialSecurityNumber: decryptField(r.svNumberEnc),
      iban: decryptField(r.ibanEnc),
      healthInsurer: r.healthInsurer,
    },
    workPermission: { workAuthorization: r.workAuthorization, priorDaysWorked: r.priorDaysWorked },
    agreements: { dataConsentAt: r.consentDataAt, riderTermsAt: r.contractAckAt, codeOfConductAt: r.conductAckAt },
    status: { current: r.status, submittedAt: r.submittedAt, approvedAt: r.approvedAt, activatedAt: r.activatedAt },
    documents: r.documents.map((d) => ({
      type: d.type, status: d.status, uploadedAt: d.uploadedAt, reviewedAt: d.reviewedAt,
      expiresAt: d.expiresAt, originalName: d.originalName, sha256: d.sha256,
    })),
    workDays: r.workLogs.map((w) => ({ date: w.date.toISOString().slice(0, 10), hours: w.hours })),
    bikes: r.assignments.map((a) => ({ bike: a.bike.code, assignedAt: a.assignedAt, returnedAt: a.returnedAt })),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nucleus-fleet-my-data.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
