import { audit } from "@/lib/audit";
import { csvEscape } from "@/lib/csv";
import { decryptField } from "@/lib/crypto";
import { db } from "@/lib/db";
import { isAdminRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";

/** Admin-only master-data export for the payroll provider / tax advisor. Decrypts sensitive fields, so it is audited. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) return new Response("Unauthorized", { status: 401 });

  const riders = await db.rider.findMany({
    where: { status: { in: ["APPROVED", "UBER_ONBOARDING", "ACTIVE", "SUSPENDED"] } },
    include: { user: { select: { email: true } } },
    orderBy: { lastName: "asc" },
  });
  const header = ["Last name", "First name", "Date of birth", "Email", "Tax ID", "Social security no.", "SV number requested", "IBAN", "Health insurer", "Employment type", "Nationality"];
  const rows = riders.map((r) => [
    r.lastName, r.firstName, r.dateOfBirth?.toISOString().slice(0, 10), r.user.email,
    decryptField(r.taxIdEnc), decryptField(r.svNumberEnc), r.svPending ? "yes" : "no", decryptField(r.ibanEnc),
    r.healthInsurer, r.employmentType, r.nationality,
  ]);
  await audit({ actor: { id: user.id, name: user.name }, action: "PAYROLL_EXPORTED", entityType: "Export", entityId: "payroll", meta: { rows: rows.length } });

  return new Response("﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="nucleus-fleet-payroll.csv"', "Cache-Control": "no-store" },
  });
}
