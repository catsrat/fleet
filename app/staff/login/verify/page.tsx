import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { readPendingLogin } from "@/lib/session";
import { staffVerify } from "../../actions";

export const metadata: Metadata = { title: "Verify sign-in", robots: { index: false, follow: false } };

export default async function VerifyPage() {
  const pending = await readPendingLogin();
  if (!pending || pending.stage !== "verify") redirect("/staff/login");

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Enter your code</h1>
      <p className="mt-1 text-sm text-slate-600">Open your authenticator app and enter the 6-digit code for Nucleus Fleet.</p>
      <ActionForm action={staffVerify} submit="Sign in" pendingLabel="Checking…" className="mt-6 space-y-4" buttonClass="btn btn-primary w-full">
        <div>
          <label className="label" htmlFor="code">6-digit code or recovery code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={16} className="input text-center font-mono text-lg tracking-widest" />
          <p className="help">Lost your phone? Enter one of your one-time recovery codes instead.</p>
        </div>
      </ActionForm>
      <Link href="/staff/login" className="mt-5 inline-block text-sm font-medium text-brand-700 hover:underline">← Start over</Link>
    </div>
  );
}
