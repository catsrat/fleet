import { audit } from "@/lib/audit";
import { csvEscape } from "@/lib/csv";
import { db } from "@/lib/db";
import { isStaffRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";

/** Roster export for staff. Contains no payroll identifiers. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user || !isStaffRole(user.role)) return new Response("Unauthorized", { status: 401 });

  const riders = await db.rider.findMany({ include: { user: { select: { email: true } } }, orderBy: { lastName: "asc" } });
  const header = ["First name", "Last name", "Email", "Phone", "City", "Nationality", "Non-EU", "University", "Status", "Employment type", "Work authorization", "Submitted", "Approved", "Activated"];
  const rows = riders.map((r) => [
    r.firstName, r.lastName, r.user.email, r.phone, r.city, r.nationality, r.nationalityGroup === "NON_EU" ? "yes" : "no",
    r.university, r.status, r.employmentType, r.workAuthorization,
    r.submittedAt?.toISOString().slice(0, 10), r.approvedAt?.toISOString().slice(0, 10), r.activatedAt?.toISOString().slice(0, 10),
  ]);
  await audit({ actor: { id: user.id, name: user.name }, action: "ROSTER_EXPORTED", entityType: "Export", entityId: "riders", meta: { rows: rows.length } });

  return new Response("﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="nucleus-fleet-riders.csv"', "Cache-Control": "no-store" },
  });
}
