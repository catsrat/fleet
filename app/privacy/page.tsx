import type { Metadata } from "next";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export const metadata: Metadata = { title: "Privacy notice" };

export default async function PrivacyPage() {
  const d = t(await getLocale()).privacyPage;
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <LocaleSwitch />
      </header>
      <h1 className="mt-10 text-3xl font-bold tracking-tight">{d.title}</h1>
      <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{d.updated}</p>
      <div className="mt-8 space-y-7">
        {d.sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-semibold">{s.h}</h2>
            <p className="mt-2 leading-relaxed text-slate-700">{s.p}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
