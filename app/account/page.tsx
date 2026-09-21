import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Logo } from "@/components/Logo";
import { RecoveryCodes } from "@/components/RecoveryCodes";
import { fmtDay } from "@/lib/format";
import { isStaffRole, ROLE_LABEL, type Role } from "@/lib/roles";
import { getSessionUser, homeFor } from "@/lib/session";
import { changePassword } from "./actions";

export const metadata: Metadata = { title: "Account", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const staff = isStaffRole(user.role);
  const googleOnly = !!user.googleSub && user.role === "RIDER";
  const remaining = user.recoveryCodes ? (JSON.parse(user.recoveryCodes) as string[]).length : 0;

  return (
    <div className="mx-auto max-w-md space-y-6 px-5 py-8">
      <Logo href={user.mustChangePassword ? "/account" : homeFor(user.role)} />

      {user.mustChangePassword && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          You are using a temporary password. Choose your own password to continue.
        </div>
      )}

      <div className="card p-6">
        <h1 className="text-xl font-bold">Your account</h1>
        <p className="mt-1 text-sm text-slate-600">
          {user.name} · {user.email}
          {staff && <> · {ROLE_LABEL[user.role as Role]}{user.username ? ` (ID: ${user.username})` : ""}</>}
        </p>

        {googleOnly ? (
          <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">You sign in with Google, so there is no password to manage here.</p>
        ) : (
          <>
            <h2 className="mt-6 font-semibold">Change password</h2>
            <ActionForm action={changePassword} submit="Update password" pendingLabel="Updating…" resetOnSuccess className="mt-3 space-y-4" buttonClass="btn btn-primary w-full">
              <div>
                <label className="label" htmlFor="current">Current password</label>
                <input id="current" name="current" type="password" autoComplete="current-password" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor="next">New password</label>
                <input id="next" name="next" type="password" autoComplete="new-password" required minLength={staff ? 12 : 10} className="input" />
                <p className="help">At least {staff ? 12 : 10} characters, with letters and numbers.</p>
              </div>
            </ActionForm>
          </>
        )}
      </div>

      {staff && user.totpEnabledAt && (
        <div className="card p-6">
          <h2 className="font-semibold">Two-factor sign-in</h2>
          <p className="mt-1 text-sm text-slate-600">On since {fmtDay(user.totpEnabledAt)}. Your authenticator app is asked for a code at every sign-in.</p>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold">Recovery codes</h3>
            <div className="mt-2"><RecoveryCodes remaining={remaining} /></div>
          </div>
        </div>
      )}

      {!user.mustChangePassword && <Link href={homeFor(user.role)} className="inline-block text-sm font-medium text-brand-700 hover:underline">← Back</Link>}
    </div>
  );
}
