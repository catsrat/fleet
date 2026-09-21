import { setLocale } from "@/app/actions/locale";
import { getLocale } from "@/lib/locale";

export async function LocaleSwitch({ dark = false }: { dark?: boolean }) {
  const current = await getLocale();
  const base = "px-2.5 py-1 text-xs font-semibold transition";
  const on = dark ? "bg-white/20 text-white" : "bg-slate-900 text-white";
  const off = dark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:bg-slate-100";
  return (
    <form action={setLocale} className={`inline-flex overflow-hidden rounded-lg border ${dark ? "border-white/20" : "border-slate-300"}`}>
      {(["en", "de"] as const).map((l) => (
        <button key={l} name="locale" value={l} aria-pressed={current === l} className={`${base} ${current === l ? on : off}`}>
          {l.toUpperCase()}
        </button>
      ))}
    </form>
  );
}
