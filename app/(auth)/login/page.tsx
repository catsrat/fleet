import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { GoogleButton } from "@/components/GoogleButton";
import { isGoogleConfigured } from "@/lib/google";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { getSessionUser, homeFor } from "@/lib/session";
import { login } from "../actions";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));
  const locale = await getLocale();
  const d = t(locale);
  const { error } = await searchParams;

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">{d.auth.loginTitle}</h1>
      {error === "google" && (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{d.auth.googleError}</p>
      )}
      <div className="mt-6">
        {isGoogleConfigured() && <GoogleButton label={d.auth.google} divider={d.auth.or} />}
        <ActionForm action={login} submit={d.auth.submitLogin} pendingLabel={d.auth.working} className="space-y-4" buttonClass="btn btn-primary w-full">
          <div>
            <label className="label" htmlFor="email">{d.auth.email}</label>
            <input id="email" name="email" type="email" autoComplete="email" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">{d.auth.password}</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          </div>
        </ActionForm>
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        {d.auth.noAccount}{" "}
        <Link href="/register" className="font-semibold text-brand-700 hover:underline">
          {d.nav.register}
        </Link>
      </p>
    </div>
  );
}
