import Link from "next/link";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { Logo } from "@/components/Logo";
import { COMPANY } from "@/lib/constants";
import { DOC_SPECS, type DocType } from "@/lib/documents";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { getSessionUser, homeFor } from "@/lib/session";

const NEEDED: { type: DocType; badge?: "nonEu" | "ownBike" }[] = [
  { type: "PROFILE_PHOTO" },
  { type: "ID_FRONT" },
  { type: "ENROLLMENT_CERT" },
  { type: "HEALTH_INSURANCE" },
  { type: "PERMIT_FRONT", badge: "nonEu" },
  { type: "BIKE_PHOTO", badge: "ownBike" },
];

function Check({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 ${className}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
    </svg>
  );
}

export default async function LandingPage() {
  const [locale, user] = await Promise.all([getLocale(), getSessionUser()]);
  const d = t(locale);
  const payrollLine =
    locale === "de"
      ? "Außerdem: Steuer-ID, IBAN und – falls vorhanden – Sozialversicherungsnummer."
      : "Plus your tax ID, IBAN and — if you have one — social security number.";
  const preview = [
    { label: DOC_SPECS.PROFILE_PHOTO[locale].label, state: "ok" },
    { label: DOC_SPECS.ID_FRONT[locale].label, state: "ok" },
    { label: DOC_SPECS.ENROLLMENT_CERT[locale].label, state: "review" },
    { label: DOC_SPECS.PERMIT_FRONT[locale].label, state: "fix" },
  ] as const;
  const previewText = {
    ok: locale === "de" ? "Freigegeben" : "Approved",
    review: locale === "de" ? "In Prüfung" : "In review",
    fix: locale === "de" ? "Neues Foto nötig" : "Needs a new photo",
  };
  const previewTone = {
    ok: "bg-emerald-400/15 text-emerald-300",
    review: "bg-sky-400/15 text-sky-300",
    fix: "bg-amber-400/15 text-amber-300",
  };

  return (
    <div>
      <section className="bg-ink text-white">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Logo dark />
          <div className="flex items-center gap-3">
            <LocaleSwitch dark />
            {user ? (
              <Link href={homeFor(user.role)} className="btn btn-primary btn-sm">{d.nav.home}</Link>
            ) : (
              <>
                <Link href="/login" className="hidden text-sm font-medium text-slate-200 hover:text-white sm:inline">{d.nav.login}</Link>
                <Link href="/register" className="btn btn-primary btn-sm">{d.nav.register}</Link>
              </>
            )}
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
          <div>
            <span className="chip bg-brand-400/15 text-brand-300">{d.landing.eyebrow}</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{d.landing.title}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">{d.landing.sub}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href={user ? homeFor(user.role) : "/register"} className="btn btn-primary px-6 py-3 text-base">
                {d.landing.cta}
              </Link>
              {!user && (
                <span className="text-sm text-slate-400">
                  {d.landing.haveAccount}{" "}
                  <Link href="/login" className="font-semibold text-brand-300 hover:underline">{d.nav.login}</Link>
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur" aria-hidden="true">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">{d.apply.title}</p>
              <span className="text-xs text-slate-400">3 / 6</span>
            </div>
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 rounded-full bg-brand-400" />
            </div>
            <ul className="space-y-3">
              {preview.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3">
                  <span className="text-sm text-slate-100">{p.label}</span>
                  <span className={`chip shrink-0 ${previewTone[p.state]}`}>{previewText[p.state]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-bold tracking-tight">{d.landing.stepsTitle}</h2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {d.landing.steps.map((s, i) => (
            <li key={s.t} className="card p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{i + 1}</span>
              <h3 className="mt-4 font-semibold">{s.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-bold tracking-tight">{d.landing.needTitle}</h2>
          <p className="mt-2 max-w-2xl text-slate-600">{d.landing.needSub}</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {NEEDED.map(({ type, badge }) => (
              <li key={type} className="flex gap-3 rounded-xl border border-slate-200 p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700"><Check /></span>
                <div>
                  <p className="font-semibold">{DOC_SPECS[type][locale].label}</p>
                  {badge && (
                    <span className="chip mt-1 bg-amber-100 text-amber-800">
                      {badge === "nonEu" ? d.landing.needNonEu : d.landing.needOwnBike}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-slate-600">{payrollLine}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-16 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-xl font-bold">{d.landing.reqTitle}</h2>
          <ul className="mt-4 space-y-3">
            {d.landing.reqs.map((r) => (
              <li key={r} className="flex gap-3 text-slate-700">
                <Check className="mt-1 shrink-0 text-brand-600" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-bold text-amber-900">{d.landing.limitTitle}</h2>
          <p className="mt-3 leading-relaxed text-amber-900/80">{d.landing.limitBody}</p>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} {COMPANY.legalName}</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-slate-900">{d.nav.privacy}</Link>
            <a href={`mailto:${COMPANY.supportEmail}`} className="hover:text-slate-900">{COMPANY.supportEmail}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
