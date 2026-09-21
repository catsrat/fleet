import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { isStaffRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";
import { staffLogin } from "../actions";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false, follow: false } };

export default async function StaffLoginPage() {
  const user = await getSessionUser();
  if (user && isStaffRole(user.role)) redirect("/admin");

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Staff sign-in</h1>
      <p className="mt-1 text-sm text-slate-600">Authorised personnel only. All access is logged.</p>
      <ActionForm action={staffLogin} submit="Continue" pendingLabel="Checking…" className="mt-6 space-y-4" buttonClass="btn btn-primary w-full">
        <div>
          <label className="label" htmlFor="identifier">Admin ID or email</label>
          <input id="identifier" name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
      </ActionForm>
    </div>
  );
}
