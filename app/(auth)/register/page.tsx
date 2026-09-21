import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { GoogleButton } from "@/components/GoogleButton";
import { isGoogleConfigured } from "@/lib/google";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { getSessionUser, homeFor } from "@/lib/session";
import { register } from "../actions";

export const metadata: Metadata = { title: "Apply" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));
  const locale = await getLocale();
  const d = t(locale);

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">{d.auth.registerTitle}</h1>
      <div className="mt-6">
        {isGoogleConfigured() && <GoogleButton label={d.auth.google} divider={d.auth.or} />}
        <ActionForm action={register} submit={d.auth.submitRegister} pendingLabel={d.auth.working} className="space-y-4" buttonClass="btn btn-primary w-full">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="firstName">{d.auth.firstName}</label>
              <input id="firstName" name="firstName" autoComplete="given-name" required maxLength={60} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="lastName">{d.auth.lastName}</label>
              <input id="lastName" name="lastName" autoComplete="family-name" required maxLength={60} className="input" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="email">{d.auth.email}</label>
            <input id="email" name="email" type="email" autoComplete="email" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">{d.auth.password}</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className="input" />
            <p className="help">{d.auth.passwordHint}</p>
          </div>
        </ActionForm>
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        {d.auth.hasAccount}{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          {d.nav.login}
        </Link>
      </p>
    </div>
  );
}
