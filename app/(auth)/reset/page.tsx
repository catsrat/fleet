import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { findUsableToken } from "@/lib/password-reset";
import { completeReset } from "./actions";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const locale = await getLocale();
  const d = t(locale).auth;
  const { token } = await searchParams;
  const valid = token ? await findUsableToken(token) : null;

  if (!valid) {
    return (
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{d.resetExpiredTitle}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{d.resetExpiredBody}</p>
        <Link href="/forgot" className="btn btn-primary mt-6 w-full">{d.forgotSubmit}</Link>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">{d.resetTitle}</h1>
      <ActionForm action={completeReset} submit={d.resetSubmit} pendingLabel={d.working} className="mt-6 space-y-4" buttonClass="btn btn-primary w-full">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="password">{d.newPassword}</label>
          <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="input" />
          <p className="help">{d.passwordHint}</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">{d.repeatPassword}</label>
          <input id="confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" className="input" />
        </div>
      </ActionForm>
    </div>
  );
}
