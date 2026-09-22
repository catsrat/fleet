import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { requestReset } from "../reset/actions";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default async function ForgotPasswordPage() {
  const locale = await getLocale();
  const d = t(locale).auth;

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">{d.forgotTitle}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{d.forgotIntro}</p>
      <ActionForm action={requestReset} submit={d.forgotSubmit} pendingLabel={d.working} className="mt-6 space-y-4" buttonClass="btn btn-primary w-full">
        <div>
          <label className="label" htmlFor="email">{d.email}</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-slate-600">
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">{d.backToLogin}</Link>
      </p>
    </div>
  );
}
