import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EnrollForm } from "@/components/EnrollForm";
import { db } from "@/lib/db";
import { isStaffRole } from "@/lib/roles";
import { readPendingLogin } from "@/lib/session";
import { ensureEnrollmentSecret, enrollmentQr, groupSecret } from "@/lib/staff-mfa";

export const metadata: Metadata = { title: "Set up two-factor", robots: { index: false, follow: false } };

export default async function EnrollPage() {
  const pending = await readPendingLogin();
  if (!pending || pending.stage !== "enroll") redirect("/staff/login");
  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.active || !isStaffRole(user.role)) redirect("/staff/login");
  if (user.totpEnabledAt) redirect("/staff/login/verify");

  const secret = await ensureEnrollmentSecret(user);
  const qr = await enrollmentQr(user.username ?? user.email, secret);

  return (
    <div className="card p-6 sm:p-8">
      <EnrollForm qr={qr} secret={groupSecret(secret)} />
    </div>
  );
}
